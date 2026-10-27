import {
  DATA_APP_BROKER_INIT,
  DATA_APP_BROKER_READY,
  DATA_APP_IFRAME_BROKER_HASH_KEY,
  DATA_APP_IFRAME_LOCALE_HASH_KEY,
  DATA_APP_ROUTE_MESSAGE_TYPE,
} from "metabase-enterprise/data-apps/constants";
import { isDataAppMessage } from "metabase-enterprise/data-apps/host/lib/is-data-app-message";

import {
  type BrokerCancelMessage,
  type BrokerRequestMessage,
  type BrokerResponseMessage,
  getBrokerableApiPath,
  isBrokerResponseMessage,
} from "./protocol";

const HOST_ORIGIN_STORAGE_KEY = "metabase.data-app.broker-host-origin";
const USER_LOCALE_STORAGE_KEY = "metabase.data-app.user-locale";
const LOCALE_PATTERN = /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;

let hostOrigin: string | null = null;
let userLocale: string | null = null;
let nextId = 1;
const pending = new Map<number, (message: BrokerResponseMessage) => void>();

let resolveReady: (port: MessagePort) => void = () => {};
const ready = new Promise<MessagePort>((resolve) => {
  resolveReady = resolve;
});

function parseOrigin(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseLocale(value: string | null): string | null {
  return value !== null && LOCALE_PATTERN.test(value) ? value : null;
}

function readStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    // Without storage, a reload after in-app navigation loses these values.
  }
}

/**
 * The top page writes its origin and the user's locale into the URL hash. In-app
 * navigation drops the hash, and a reload of the frame must still find them, so they
 * are kept in `sessionStorage`. The hash entries are removed, so an app's own hash
 * router never sees them.
 */
function readLaunchParams(): {
  hostOrigin: string | null;
  userLocale: string | null;
} {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = parseOrigin(hash.get(DATA_APP_IFRAME_BROKER_HASH_KEY));

  if (!fromHash) {
    return {
      hostOrigin: parseOrigin(readStorage(HOST_ORIGIN_STORAGE_KEY)),
      userLocale: parseLocale(readStorage(USER_LOCALE_STORAGE_KEY)),
    };
  }

  const localeFromHash = parseLocale(hash.get(DATA_APP_IFRAME_LOCALE_HASH_KEY));
  hash.delete(DATA_APP_IFRAME_BROKER_HASH_KEY);
  hash.delete(DATA_APP_IFRAME_LOCALE_HASH_KEY);
  const restOfHash = hash.toString();
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname +
      window.location.search +
      (restOfHash ? `#${restOfHash}` : ""),
  );

  writeStorage(HOST_ORIGIN_STORAGE_KEY, fromHash);
  writeStorage(USER_LOCALE_STORAGE_KEY, localeFromHash);

  return { hostOrigin: fromHash, userLocale: localeFromHash };
}

/** True when the iframe is served cross-origin and must proxy instance traffic. */
export function isDataAppBrokerMode(): boolean {
  return hostOrigin !== null;
}

/**
 * The user's locale that the top page passed in cross-origin mode, or null. Call after
 * [[initDataAppBroker]].
 */
export function getDataAppUserLocale(): string | null {
  return userLocale;
}

/**
 * The origin the iframe should `postMessage` the host at: the broker host in
 * cross-origin mode, or its own origin same-origin. Call after [[initDataAppBroker]].
 */
export function getDataAppParentOrigin(): string {
  return hostOrigin ?? window.location.origin;
}

/**
 * Install the iframe side of the broker. A no-op in same-origin mode. Otherwise it
 * completes the `MessagePort` handshake with the host.
 */
export function initDataAppBroker(): void {
  ({ hostOrigin, userLocale } = readLaunchParams());

  if (!hostOrigin) {
    return;
  }

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.origin !== hostOrigin || event.source !== window.parent) {
      return;
    }

    if (
      !isDataAppMessage(event.data, DATA_APP_BROKER_INIT) ||
      !event.ports[0]
    ) {
      return;
    }

    const port = event.ports[0];
    port.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (isBrokerResponseMessage(data)) {
        pending.get(data.id)?.(data);
      }
    };

    resolveReady(port);
  });

  window.parent.postMessage({ type: DATA_APP_BROKER_READY }, hostOrigin);
}

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("The operation was aborted.", "AbortError");

function waitForPort(signal: AbortSignal | null): Promise<MessagePort> {
  if (!signal) {
    return ready;
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    void ready.then((port) => {
      signal.removeEventListener("abort", onAbort);
      resolve(port);
    });
  });
}

async function brokeredFetch(
  request: Request,
  signal: AbortSignal | null,
): Promise<Response> {
  const body = request.body ? await request.arrayBuffer() : null;
  const port = await waitForPort(signal);

  if (signal?.aborted) {
    throw abortReason(signal);
  }

  const id = nextId++;
  const message: BrokerRequestMessage = {
    type: "request",
    id,
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    body,
  };

  const response = await new Promise<BrokerResponseMessage>(
    (resolve, reject) => {
      const onAbort = () => {
        pending.delete(id);
        const cancel: BrokerCancelMessage = { type: "cancel", id };
        port.postMessage(cancel);
        if (signal) {
          reject(abortReason(signal));
        }
      };

      pending.set(id, (answer) => {
        pending.delete(id);
        signal?.removeEventListener("abort", onAbort);
        resolve(answer);
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      port.postMessage(message);
    },
  );

  if ("networkError" in response) {
    throw new TypeError(response.networkError);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Patch the iframe host realm's `window.fetch` so every `fetch` to the instance API goes
 * through the broker — the SDK's ApiClient, the bundle fetch, and any hand-rolled `fetch`
 * alike. Static assets and the app's third-party `allowed_hosts` fetches fall through to
 * the native fetch. A no-op same-origin (not in broker mode).
 */
export function installDataAppFetchBroker(): void {
  if (!isDataAppBrokerMode()) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  // Async, so that an invalid request rejects, as `fetch` does, instead of throwing.
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try {
      const href = input instanceof Request ? input.url : input.toString();
      url = new URL(href, window.location.origin);
    } catch {
      return nativeFetch(input, init);
    }

    const isInstanceApi =
      url.origin === window.location.origin &&
      getBrokerableApiPath(url) !== null;

    if (!isInstanceApi) {
      return nativeFetch(input, init);
    }

    return brokeredFetch(
      input instanceof Request
        ? new Request(input, init)
        : new Request(url.href, init),
      init?.signal ?? (input instanceof Request ? input.signal : null),
    );
  };
}

/**
 * In broker mode, tell the top page each time the app's route changes, so it can mirror
 * the route into its own URL (it can't read the cross-origin iframe's `location`).
 */
export function installDataAppRouteReporter(): void {
  const parentOrigin = hostOrigin;

  if (!parentOrigin) {
    return;
  }

  const report = () =>
    window.parent.postMessage(
      { type: DATA_APP_ROUTE_MESSAGE_TYPE, path: window.location.pathname },
      parentOrigin,
    );

  const { history } = window;
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    pushState(...args);
    report();
  };
  history.replaceState = (...args) => {
    replaceState(...args);
    report();
  };
  window.addEventListener("popstate", report);
}
