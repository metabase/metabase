import fs from "node:fs";
import { parse as parseYaml } from "yaml";

/**
 * Read the `allowed_hosts` list from this app's `data_app.yml`/`.yaml`. Returns
 * `[]` when the file is missing/unparseable or the key is absent; non-string
 * entries are dropped.
 */
export function readAllowedHosts(yamlPath: string): string[] {
  let parsed: unknown;
  try {
    parsed = parseYaml(fs.readFileSync(yamlPath, "utf8"));
  } catch {
    return [];
  }

  const hosts =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { allowed_hosts?: unknown }).allowed_hosts
      : undefined;

  return Array.isArray(hosts)
    ? hosts.filter((host): host is string => typeof host === "string")
    : [];
}

/**
 * Dev-server CSP `connect-src` that mirrors what Metabase emits for a data app
 * in production: the app may reach its declared `allowed_hosts` (plus the
 * Metabase instance, for the SDK's own calls) and the Vite dev server / HMR
 * websocket — nothing else. So a `fetch`/XHR a production data app couldn't
 * make is blocked by the browser in `npm run dev` too, instead of silently
 * working locally and failing once sandboxed in Metabase.
 */
function toOrigin(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function buildDevConnectSrcCsp(
  allowedHosts: string[],
  metabaseUrl: string | undefined,
): string {
  // The Metabase instance origin MUST be allowed — the SDK calls it (and in dev
  // it's a different origin than the dev server, so `'self'` doesn't cover it).
  const instanceOrigin = toOrigin(metabaseUrl);
  const sources = [
    "'self'",
    "ws://localhost:*",
    "wss://localhost:*",
    "ws://127.0.0.1:*",
    "wss://127.0.0.1:*",
    ...(instanceOrigin ? [instanceOrigin] : []),
    ...allowedHosts,
  ];
  return `connect-src ${sources.join(" ")}`;
}
