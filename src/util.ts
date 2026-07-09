import { EnvVariable } from "./core/models/environment";

/** Keys whose values look like secrets and should be masked from agent view. */
const SECRET_RE = /(token|key|secret|password|passwd|pwd|auth|bearer|credential|api[-_]?key)/i;

export function isSecretKey(key: string): boolean {
  return SECRET_RE.test(key);
}

/**
 * Return environment variables with secret VALUES masked. Keys are always
 * shown so an agent knows what exists; values for secret-looking keys are
 * replaced with a placeholder. send_request still resolves the real values
 * server-side, so masking never blocks the agent from USING a secret — it
 * only stops the raw value entering the agent's context.
 */
export function maskSecrets(vars: EnvVariable[]): Array<{ key: string; value: string; enabled: boolean; masked: boolean }> {
  return vars.map((v) => {
    const masked = isSecretKey(v.key) && v.value.length > 0;
    return {
      key: v.key,
      value: masked ? "•••• (set)" : v.value,
      enabled: v.enabled,
      masked,
    };
  });
}

/** Truncate a response body to `cap` bytes, appending a marker with the full size. */
export function truncateBody(body: string, cap: number): { body: string; truncated: boolean; fullLength: number } {
  const fullLength = body.length;
  if (fullLength <= cap) return { body, truncated: false, fullLength };
  return {
    body: body.slice(0, cap) + `\n…[truncated ${fullLength - cap} of ${fullLength} chars]`,
    truncated: true,
    fullLength,
  };
}
