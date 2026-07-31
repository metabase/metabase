import { relativeUrl } from "metabase/api/client/utils";
import { getBasename } from "metabase/utils/basename";
import {
  DATA_APP_BROKER_INIT,
  DATA_APP_BROKER_READY,
  DATA_APP_IFRAME_BROKER_HASH_KEY,
} from "metabase-enterprise/data_apps/constants";

import type { BrokerRequestMessage, BrokerResponseMessage } from "./protocol";

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

let hostOrigin: string | null = null;
let port: MessagePort | null = null;
let nextId = 1;
const pending = new Map<number, (message: BrokerResponseMessage) => void>();

let resolveReady: () => void = () => {};
const ready = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

function readHostOriginFromHash(): string | null {
  const value = new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
    DATA_APP_IFRAME_BROKER_HASH_KEY,
  );

  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** True when the iframe is served cross-origin and must proxy instance traffic. */
export function isDataAppBrokerMode(): boolean {
  return hostOrigin !== null;
}

/**
 * The origin the iframe should `postMessage` the host at: the broker host in
 * cross-origin mode, or its own origin same-origin. Call after [[initDataAppBroker]].
 */
export function getDataAppParentOrigin(): string {
  return hostOrigin ?? window.location.origin;
}

/**
 * Install the iframe side of the broker. A no-op in same-origin mode (no host origin
 * in the URL hash). Otherwise it completes the `MessagePort` handshake with the host,
 * driving it from here so it can't race the host's iframe `load` handler.
 */
export function initDataAppBroker(): void {
  hostOrigin = readHostOriginFromHash();

  if (!hostOrigin) {
    return;
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== hostOrigin || event.source !== window.parent) {
      return;
    }

    if (event.data?.type !== DATA_APP_BROKER_INIT || !event.ports[0]) {
      return;
    }

    port = event.ports[0];
    port.onmessage = (messageEvent) => {
      // Both ends of this private port are ours, so the payload is a response message.
      const message = messageEvent.data as BrokerResponseMessage;
      const resolve = pending.get(message.id);

      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    };

    resolveReady();
  });

  window.parent.postMessage({ type: DATA_APP_BROKER_READY }, hostOrigin);
}

/** Proxy a request to the host over the broker port and rebuild the host's Response. */
export async function brokeredFetch(request: Request): Promise<Response> {
  await ready;

  if (!port) {
    throw new Error("data-app broker port unavailable");
  }

  const id = nextId++;
  const message: BrokerRequestMessage = {
    id,
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    body: request.body ? await request.text() : null,
  };

  const response = await new Promise<BrokerResponseMessage>((resolve) => {
    pending.set(id, resolve);
    port?.postMessage(message);
  });

  return new Response(
    NULL_BODY_STATUS.has(response.status) ? null : response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    },
  );
}

/**
 * Patch the iframe host realm's `window.fetch` so EVERY instance API call is routed
 * through the broker — the SDK's ApiClient, the bundle fetch, and any hand-rolled
 * `fetch` alike — not only requests that happen to go through one client. Only
 * same-origin `/api/*` requests are brokered; static assets and the app's
 * third-party `allowed_hosts` fetches fall through to the native fetch. A no-op
 * same-origin (not in broker mode).
 */
export function installDataAppFetchBroker(): void {
  if (!isDataAppBrokerMode()) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try {
      const href = input instanceof Request ? input.url : input.toString();
      url = new URL(href, window.location.origin);
    } catch {
      return nativeFetch(input, init);
    }

    const isInstanceApi =
      url.origin === window.location.origin &&
      relativeUrl(getBasename(), url).startsWith("/api/");

    if (!isInstanceApi) {
      return nativeFetch(input, init);
    }

    return brokeredFetch(
      input instanceof Request
        ? new Request(input, init)
        : new Request(url.href, init),
    );
  };
}
