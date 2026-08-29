import type { ConfigEnv } from "vite";

/**
 * `DATA_APP_*` vars are exposed to the bundle in the dev preview ONLY. A
 * production build gets `undefined`, so dev secrets can never be inlined into the
 * shipped `dist/index.js` — even if app code reads `import.meta.env.DATA_APP_*`.
 */
export function dataAppEnvPrefix(
  command: ConfigEnv["command"],
): string[] | undefined {
  return command === "serve" ? ["DATA_APP_"] : undefined;
}
