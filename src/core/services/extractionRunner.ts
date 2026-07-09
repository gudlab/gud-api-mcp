import { HttpResponse, VariableExtraction } from "../models/request";
import { evaluateJsonPath } from "./jsonPath";

/**
 * Runs variable extractions against an HTTP response.
 * Returns a map of variable name → extracted value.
 */
export function runExtractions(
  response: HttpResponse,
  extractions: VariableExtraction[],
): Map<string, string> {
  const result = new Map<string, string>();

  for (const ext of extractions) {
    if (!ext.variable.trim()) continue;
    if (ext.source !== "status" && !ext.expression.trim()) continue;

    let value: string | undefined;

    switch (ext.source) {
      case "body_jsonpath":
        value = evaluateJsonPath(response.body, ext.expression);
        break;
      case "header":
        value = response.headers[ext.expression.toLowerCase()];
        break;
      case "status":
        value = response.status.toString();
        break;
      case "body_regex":
        try {
          const match = new RegExp(ext.expression).exec(response.body);
          value = match ? (match[1] ?? match[0]) : undefined;
        } catch {
          // invalid regex
        }
        break;
    }

    if (value !== undefined) {
      result.set(ext.variable.trim(), value);
    }
  }

  return result;
}
