/**
 * Shared protocol for the data-app request broker.
 *
 * When the sandbox iframe is served from a separate origin (`MB_DATA_APPS_HOST`) it
 * has no session cookie, so its authenticated requests are proxied to the host app
 * — which does have the cookie — over a `MessagePort`.
 *
 * What the app may reach is decided server-side: the host stamps every proxied
 * request as the `data-app` client, which confines it to the `data-apps:base` scope,
 * so only endpoints tagged for data apps answer it. That is the same boundary a
 * same-origin data app runs under, and the only one — this file deliberately keeps
 * no second copy of that policy.
 */

export interface BrokerRequestMessage {
  id: number;
  method: string;
  /** Absolute URL from the iframe's ApiClient; the host uses only its path + search. */
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface BrokerResponseMessage {
  id: number;
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Endpoint scopes only govern `/api` routes, so the broker relays nothing else:
 * an SSO or static path would reach the session with no scope check behind it.
 */
export function isBrokerableApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}
