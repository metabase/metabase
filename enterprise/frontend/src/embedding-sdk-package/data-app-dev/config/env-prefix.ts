import type { ConfigEnv } from "vite";

/**
 * The env-var prefix Vite exposes to `import.meta.env` for a data app.
 *
 * The app's `DATA_APP_*` vars (including the dev `DATA_APP_MB_API_KEY` kept in
 * `.env.local`) are exposed to the bundle in the dev preview ONLY. A production
 * `vite build` gets `undefined` (Vite's default `VITE_` prefix), so those dev
 * secrets can never be statically inlined into the shipped `dist/index.js` that
 * Metabase serves to users — even if app code reads `import.meta.env.DATA_APP_*`.
 */
export function dataAppEnvPrefix(
  command: ConfigEnv["command"],
): string[] | undefined {
  return command === "serve" ? ["DATA_APP_"] : undefined;
}
