import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

/** Read `allowed_hosts` from the app's `data_app.yml`/`.yaml`; `[]` when absent. */
export function readAllowedHosts(appRoot: string): string[] {
  const manifestPath = [
    path.join(appRoot, "data_app.yaml"),
    path.join(appRoot, "data_app.yml"),
  ].find((candidate) => fs.existsSync(candidate));
  if (!manifestPath) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(fs.readFileSync(manifestPath, "utf8"));
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

function toOrigin(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Dev-server CSP `connect-src` mirroring what Metabase emits for a data app in
 * production: the app may reach its `allowed_hosts` (plus the Metabase instance,
 * for the SDK's own calls) and the Vite dev server / HMR websocket — nothing
 * else. So a `fetch`/XHR a production data app couldn't make is blocked in
 * `npm run dev` too, instead of silently working locally.
 */
export function buildConnectSrcCsp(
  allowedHosts: string[],
  metabaseUrl: string | undefined,
): string {
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
