/**
 * Shared protocol for the data-app request broker.
 *
 * When the iframe is served from the isolated origin (`MB_ISOLATED_ORIGIN`) it makes no
 * instance requests itself: it sends each one to the top page over a `MessagePort`,
 * and the top page makes it with its session cookie.
 *
 * What the app may reach is decided server-side: the top page stamps every relayed
 * request as the `data-app` client, which confines it to the `data-apps:base` scope,
 * so only endpoints tagged for data apps answer it. That is the same boundary a
 * same-origin data app runs under.
 */

import { getBasenamePath } from "metabase/api/client/utils";
import { getBasename } from "metabase/utils/basename";
import type { DATA_APP_BROKER_INIT_MESSAGE_TYPE } from "metabase-enterprise/data-apps/constants";

/** top page to iframe, with the port in `event.ports[0]`. */
export interface BrokerInitMessage {
  type: typeof DATA_APP_BROKER_INIT_MESSAGE_TYPE;
  /** The isolated origin serves the iframe document without a signed-in user, so its document can't carry the user's locale. */
  locale: string | null;
}

/** iframe to top page: make this request. */
export interface BrokerRequestMessage {
  type: "request";
  id: number;
  method: string;
  /** Absolute URL of the relayed `fetch`; the top page uses only its path and query string. */
  url: string;
  headers: Record<string, string>;
  /** Raw bytes rather than text, so binary uploads arrive intact. */
  body: ArrayBuffer | null;
}

/** iframe to top page: the app aborted request `id`. */
export interface BrokerCancelMessage {
  type: "cancel";
  id: number;
}

export type BrokerPortMessage = BrokerRequestMessage | BrokerCancelMessage;

export interface BrokerHttpResponse {
  id: number;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Raw bytes rather than text, so exports and images arrive intact; null for null-body statuses. */
  body: ArrayBuffer | null;
}

/** The top page's request failed without a response, as a `fetch` network error does. */
export interface BrokerNetworkError {
  id: number;
  networkError: string;
}

/** top page to iframe. */
export type BrokerResponseMessage = BrokerHttpResponse | BrokerNetworkError;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every((entry) => typeof entry === "string");

/**
 * True when `value` is a well-formed request or cancel message. The port's other end
 * is the app document, which may run code that escaped the sandbox.
 */
export function isBrokerPortMessage(
  value: unknown,
): value is BrokerPortMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  if (!("id" in value) || typeof value.id !== "number") {
    return false;
  }

  if (value.type === "cancel") {
    return true;
  }

  return (
    value.type === "request" &&
    "method" in value &&
    typeof value.method === "string" &&
    "url" in value &&
    typeof value.url === "string" &&
    "headers" in value &&
    isStringRecord(value.headers) &&
    "body" in value &&
    (value.body === null || value.body instanceof ArrayBuffer)
  );
}

export function isBrokerResponseMessage(
  value: unknown,
): value is BrokerResponseMessage {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "number"
  ) {
    return false;
  }

  if ("networkError" in value) {
    return typeof value.networkError === "string";
  }

  return (
    "status" in value &&
    typeof value.status === "number" &&
    "statusText" in value &&
    typeof value.statusText === "string" &&
    "headers" in value &&
    isStringRecord(value.headers) &&
    "body" in value &&
    (value.body === null || value.body instanceof ArrayBuffer)
  );
}

/**
 * The broker relays only `/api` paths. Outside `/api`, routes such as HTML pages and
 * static files have no endpoint scope check, so the session would reach them unconfined.
 */
export function isBrokerableApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

/**
 * The instance API path of `url`, without the basename, or null when `url` is not
 * under the basename's `/api`. A path outside the basename belongs to whatever else
 * the origin serves, not to Metabase.
 */
export function getBrokerableApiPath(url: URL): string | null {
  const basePath = getBasenamePath(getBasename());

  if (!url.pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  const path = url.pathname.slice(basePath.length);

  return isBrokerableApiPath(path) ? path : null;
}
