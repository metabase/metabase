import type { ConfigEnv } from "vite";

/** Env vars with this prefix reach the dev preview page; nothing else in `.env.local` does. */
const DATA_APP_PUBLIC_ENV_PREFIX = "DATA_APP_PUBLIC_";

/**
 * The env vars `import.meta.env` exposes. In the dev preview, `DATA_APP_MB_URL` and `DATA_APP_MB_API_KEY` stay in the
 * dev server, which relays the instance itself, so neither the key nor any other secret in the repo-root `.env.local`
 * (such as a `VITE_` var, Vite's default prefix) reaches the page. A production build gets `undefined`, so no
 * `DATA_APP_` var can be inlined into the shipped `dist/index.js`.
 */
export function dataAppEnvPrefix(
  command: ConfigEnv["command"],
): string[] | undefined {
  return command === "serve" ? [DATA_APP_PUBLIC_ENV_PREFIX] : undefined;
}
