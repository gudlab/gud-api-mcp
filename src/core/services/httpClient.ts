import * as fs from "fs";
import * as path from "path";
import { HttpRequest, HttpResponse, MultipartField } from "../models/request";
import { EnvVariable } from "../models/environment";
import { resolveRequest } from "./variableResolver";
import * as cookieJar from "./cookieJar";

export async function execute(
  request: HttpRequest,
  collectionVars: EnvVariable[] = [],
  envVars: EnvVariable[] = [],
  multipartFields?: MultipartField[],
  globalVars: EnvVariable[] = [],
): Promise<HttpResponse> {
  // Resolve {{variables}} in URL, headers, and body
  const resolved = resolveRequest(
    request.url,
    request.headers,
    request.body,
    collectionVars,
    envVars,
    globalVars,
  );

  const init: RequestInit = {
    method: request.method,
    headers: { ...resolved.headers },
  };

  // Inject cookies
  const cookieHeader = cookieJar.getCookieHeader(resolved.url);
  if (cookieHeader) {
    (init.headers as Record<string, string>)["Cookie"] = cookieHeader;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (multipartFields && multipartFields.length > 0) {
      // Build multipart/form-data
      const formData = new FormData();
      for (const field of multipartFields) {
        if (!field.key.trim()) continue;
        if (field.type === "file" && field.value) {
          try {
            const buffer = fs.readFileSync(field.value);
            const blob = new Blob([buffer]);
            const fileName = field.fileName || path.basename(field.value);
            formData.append(field.key.trim(), blob, fileName);
          } catch {
            // Skip files that can't be read
          }
        } else {
          formData.append(field.key.trim(), field.value);
        }
      }
      init.body = formData;
      // Remove Content-Type so fetch can set it with boundary
      delete (init.headers as Record<string, string>)["Content-Type"];
    } else if (resolved.body) {
      init.body = resolved.body;
    }
  }

  const start = performance.now();

  try {
    const res = await fetch(resolved.url, init);
    const body = await res.text();
    const timeMs = Math.round(performance.now() - start);

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Capture cookies from response
    try {
      const setCookies = (res.headers as any).getSetCookie?.() ?? [];
      if (setCookies.length > 0) {
        cookieJar.capture(setCookies, resolved.url);
      }
    } catch {
      // getSetCookie may not be available in older Node versions
    }

    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      body,
      timeMs,
      size: new TextEncoder().encode(body).byteLength,
      resolvedUrl: resolved.url,
    };
  } catch (err) {
    const timeMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : "Unknown error";

    return {
      status: 0,
      statusText: "Error",
      headers: {},
      body: message,
      timeMs,
      size: 0,
      resolvedUrl: resolved.url,
    };
  }
}
