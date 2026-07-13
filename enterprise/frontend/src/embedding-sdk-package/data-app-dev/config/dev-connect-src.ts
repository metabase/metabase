import { readManifest } from "./read-manifest";

/** Read `allowed_hosts` from the app's `data_app.yml`/`.yaml`; `[]` when absent. */
export function readAllowedHosts(appRoot: string): string[] {
  const read = readManifest(appRoot);

  if (!read) {
    return [];
  }

  const { manifestPath, manifest } = read;
  const hosts = manifest.allowed_hosts;

  if (hosts == null) {
    return [];
  }

  if (!Array.isArray(hosts)) {
    throw new Error(`${manifestPath}: "allowed_hosts" must be a list.`);
  }

  if (!hosts.every(isString)) {
    const nonString = hosts.find((host) => !isString(host));

    throw new Error(
      `${manifestPath}: every "allowed_hosts" entry must be a string, got ${JSON.stringify(
        nonString,
      )}.`,
    );
  }

  return hosts;
}

const isString = (value: unknown): value is string => typeof value === "string";

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
