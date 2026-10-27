import {
  addAntiCsrfToken,
  updateAntiCsrfToken,
} from "metabase/api/client/csrf";
import type { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import {
  DATA_APP_BROKER_INIT_MESSAGE_TYPE,
  DATA_APP_BROKER_READY_MESSAGE_TYPE,
} from "metabase-enterprise/data-apps/constants";
import { isDataAppMessage } from "metabase-enterprise/data-apps/host/lib/is-data-app-message";

import {
  type BrokerRequestMessage,
  type BrokerResponseMessage,
  getBrokerableApiPath,
  isBrokerPortMessage,
} from "./protocol";

const NULL_BODY_STATUS = new Set([204, 205, 304]);

const FORWARDED_REQUEST_HEADERS = new Set([
  "content-type",
  "accept",
  "x-metabase-locale",
  "x-metabase-client-version",
  "x-metabase-client-identifier",
  "x-metabase-embed-referrer",
  "traceparent",
]);

const ANTI_CSRF_HEADER = "x-metabase-anti-csrf-token";

/** Matches `metabase.analytics.sdk/data-app-client`; typed off the SDK config so a typo can't compile. */
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
  status,
  statusText,
  headers: {},
  body: new TextEncoder().encode(JSON.stringify({ message })).buffer,
});

/** Make the app's request on this window's origin, where the session cookie is. */
export async function handleBrokerRequest(
  request: BrokerRequestMessage,
  signal?: AbortSignal,
): Promise<BrokerResponseMessage> {
  const { id, method, url, headers, body } = request;

  let parsed: URL;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    return refusal(id, 400, "Bad Request", "unparseable request URL");
  }

  if (getBrokerableApiPath(parsed) === null) {
    return refusal(
      id,
      403,
      "Forbidden",
      `broker refused ${method} ${parsed.pathname}`,
    );
  }

  try {
    // The marker is stamped here rather than forwarded: it confines the request to the
    // `data-apps:base` scope, so letting the app choose its own client would let a
    // compromised one opt out of that confinement.
    const outbound = new Request(
      new URL(parsed.pathname + parsed.search, window.location.origin),
      {
        method,
        headers: {
          ...safeRequestHeaders(headers),
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
          "X-Metabase-Client": DATA_APP_CLIENT,
        },
        body: body ?? undefined,
        credentials: "include",
        signal,
      },
    );
    addAntiCsrfToken(outbound);

    const response = await fetch(outbound);

    updateAntiCsrfToken(response);

    const responseHeaders = Object.fromEntries(response.headers.entries());

    delete responseHeaders[ANTI_CSRF_HEADER];

    return {
      id,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: NULL_BODY_STATUS.has(response.status)
        ? null
        : await response.arrayBuffer(),
    };
  } catch (error) {
    return { id, networkError: String(error) };
  }
}

/**
 * Install the top-page side of the broker for a data-app iframe served from `frameOrigin`.
 * Completes the `MessagePort` handshake, then makes the app's `/api` requests on this
 * origin, where the session cookie is and the `data-app` scope confines what they can
 * reach. Returns a teardown fn.
 */
export function installHostBroker(
  iframe: HTMLIFrameElement,
  frameOrigin: string,
): () => void {
  let current: {
    port: MessagePort;
    inFlight: Map<number, AbortController>;
  } | null = null;

  // A port can outlive the document it was handed to (app code can transfer it), so the
  // host closes it rather than trusting it to go away.
  const closeCurrent = () => {
    current?.inFlight.forEach((controller) => controller.abort());
    current?.port.close();
    current = null;
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    if (
      event.origin !== frameOrigin ||
      event.source !== iframe.contentWindow ||
      !isDataAppMessage(event.data, DATA_APP_BROKER_READY_MESSAGE_TYPE)
    ) {
      return;
    }

    // A reloaded frame asks again, and only its new document should be answered.
    closeCurrent();

    const channel = new MessageChannel();
    const inFlight = new Map<number, AbortController>();
    current = { port: channel.port1, inFlight };

    channel.port1.onmessage = async ({ data }: MessageEvent<unknown>) => {
      if (!isBrokerPortMessage(data)) {
        return;
      }

      if (data.type === "cancel") {
        inFlight.get(data.id)?.abort();
        return;
      }

      const controller = new AbortController();
      inFlight.set(data.id, controller);
      const response = await handleBrokerRequest(data, controller.signal);
      inFlight.delete(data.id);

      if (!controller.signal.aborted) {
        channel.port1.postMessage(response);
      }
    };

    iframe.contentWindow?.postMessage(
      { type: DATA_APP_BROKER_INIT_MESSAGE_TYPE },
      frameOrigin,
      [channel.port2],
    );
  };

  window.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener("message", onMessage);
    closeCurrent();
  };
}
