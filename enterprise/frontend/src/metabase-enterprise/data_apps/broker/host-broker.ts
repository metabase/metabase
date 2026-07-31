import { getUrlPathname } from "embedding-sdk-shared/lib/get-url-pathname";
import {
  addAntiCsrfToken,
  updateAntiCsrfToken,
} from "metabase/api/client/csrf";
import { relativeUrl } from "metabase/api/client/utils";
import type { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { getBasename } from "metabase/utils/basename";
import {
  DATA_APP_BROKER_INIT,
  DATA_APP_BROKER_READY,
} from "metabase-enterprise/data_apps/constants";

import {
  type BrokerRequestMessage,
  type BrokerResponseMessage,
  isBrokerableApiPath,
} from "./protocol";

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

const FORWARDED_REQUEST_HEADERS = new Set([
  "content-type",
  "accept",
  "x-metabase-locale",
  "traceparent",
]);

const ANTI_CSRF_HEADER = "x-metabase-anti-csrf-token";

/**
 * The client a brokered request reports itself as. Matches
 * `metabase.embedding.util/data-app-client`, which is what narrows the request to
 * the `data-apps:base` scope — typed off the SDK config so a typo cannot compile.
 */
const DATA_APP_CLIENT: (typeof EMBEDDING_SDK_CONFIG)["metabaseClientRequestHeader"] =
  "data-app";

export const safeRequestHeaders = (
  headers: Record<string, string>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).filter(([name]) =>
      FORWARDED_REQUEST_HEADERS.has(name.toLowerCase()),
    ),
  );

const refusal = (
  id: number,
  status: number,
  statusText: string,
  message: string,
): BrokerResponseMessage => ({
  id,
  ok: false,
  status,
  statusText,
  headers: {},
  body: JSON.stringify({ message }),
});

export async function handleBrokerRequest(
  request: BrokerRequestMessage,
): Promise<BrokerResponseMessage> {
  const { id, method, url, headers, body } = request;

  let path: string;
  let apiPath: string;
  try {
    const parsed = new URL(url, window.location.origin);

    path = parsed.pathname + parsed.search;
    apiPath = getUrlPathname(relativeUrl(getBasename(), parsed));
  } catch {
    return refusal(id, 400, "Bad Request", "unparseable request URL");
  }

  if (!isBrokerableApiPath(apiPath)) {
    return refusal(id, 403, "Forbidden", `broker refused ${method} ${apiPath}`);
  }

  // Re-issue on THIS window's origin — the host, which holds the session cookie.
  // The marker is stamped here rather than forwarded: it is what confines the
  // request to the `data-apps:base` scope server-side, so letting the app choose
  // its own client would let a compromised one opt out of that confinement.
  const outbound = new Request(new URL(path, window.location.origin), {
    method,
    headers: {
      ...safeRequestHeaders(headers),
      // Last, so it overwrites the app's own copy — that one is guest-controlled.
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
      "X-Metabase-Client": DATA_APP_CLIENT,
    },
    body: body ?? undefined,
    credentials: "include",
  });
  addAntiCsrfToken(outbound);

  try {
    const response = await fetch(outbound);

    // Capture a rotated token for the host; strip it from what reaches the app.
    updateAntiCsrfToken(response);

    const responseHeaders = Object.fromEntries(response.headers.entries());

    delete responseHeaders[ANTI_CSRF_HEADER];

    const responseBody = NULL_BODY_STATUS.has(response.status)
      ? ""
      : await response.text();

    return {
      id,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (error) {
    return refusal(id, 0, "", String(error));
  }
}

/**
 * Install the host side of the broker for a data-app iframe served from `appsOrigin`.
 * Completes the `MessagePort` handshake, then proxies the app's `/api` requests on
 * this (host) origin, where the session cookie is available and the `data-app`
 * scope confines what they can reach. Returns a teardown fn.
 */
export function installHostBroker(
  iframe: HTMLIFrameElement,
  appsOrigin: string,
): () => void {
  const onMessage = (event: MessageEvent) => {
    if (
      event.origin !== appsOrigin ||
      event.source !== iframe.contentWindow ||
      event.data?.type !== DATA_APP_BROKER_READY
    ) {
      return;
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = async (portEvent) => {
      // Both ends of this private port are ours, so the payload is a request message.
      const request = portEvent.data as BrokerRequestMessage;
      channel.port1.postMessage(await handleBrokerRequest(request));
    };

    iframe.contentWindow?.postMessage(
      { type: DATA_APP_BROKER_INIT },
      appsOrigin,
      [channel.port2],
    );
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
