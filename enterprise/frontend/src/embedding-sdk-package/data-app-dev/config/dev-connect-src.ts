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
  } catch (error) {
    throw new Error(
      `Could not parse ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const hosts =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { allowed_hosts?: unknown }).allowed_hosts
      : undefined;

  if (hosts == null) {
    return [];
  }

  if (!Array.isArray(hosts)) {
    throw new Error(`${manifestPath}: "allowed_hosts" must be a list.`);
  }

  const nonString = hosts.filter((host) => typeof host !== "string");

  if (nonString.length > 0) {
    throw new Error(
      `${manifestPath}: every "allowed_hosts" entry must be a string, got ${JSON.stringify(
        nonString[0],
      )}.`,
    );
  }

  return hosts as string[];
}

function toOrigin(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Dev-server CSP mirroring what Metabase emits for a data app in production:
 *
 *   - `connect-src`: the app may reach its `allowed_hosts` (plus the Metabase
 *     instance, for the SDK's own calls) and the Vite dev server / HMR websocket
 *     — nothing else. So a `fetch`/XHR a production data app couldn't make is
 *     blocked in `npm run dev` too, instead of silently working locally.
 *   - `form-action`: restricts native `<form action="…">` submits to the app's
 *     `allowed_hosts` (mirroring `connect-src`); with none declared it is
 *     `'none'`, blocking every native submit. Client-side `onSubmit` handlers
 *     still work — they preventDefault, so no submission is ever checked.
 *   - `frame-src`: the app may embed / navigate to `'self'` and its
 *     `allowed_hosts` (mirroring production, where declared hosts are added to
 *     `frame-src`), so an `<iframe>`/navigation a production app couldn't make
 *     is blocked in `npm run dev` too.
 */
export function buildDevCsp(
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
  const formAction =
    allowedHosts.length > 0 ? allowedHosts.join(" ") : "'none'";
  const frameSrc = ["'self'", ...allowedHosts].join(" ");
  return `connect-src ${sources.join(" ")}; form-action ${formAction}; frame-src ${frameSrc}`;
}
