import type { RequestMethod } from "./method";

export type OnBeforeRequestHandlerConfig = {
  method: RequestMethod;
  url: string;
  headers?: Record<string, string>;
  // URL `:tag` params (and querystring leftovers). For the legacy GET/POST
  // helpers this holds the whole request bag.
  data: Record<string, unknown>;
  // The JSON-body bag, kept as a separate channel from `data`. Exposed to
  // handlers so embed URL `:tag`s — notably the guest-embed `:token` — can be
  // filled from body fields, and so the refresh handler can swap a stale body
  // token. `undefined` for GETs, raw (FormData/URLSearchParams) bodies, and the
  // legacy helpers (which pack everything into `data`).
  body?: Record<string, unknown>;
};

export type OnBeforeRequestHandler = (
  data: OnBeforeRequestHandlerConfig,
) => Promise<void | Partial<OnBeforeRequestHandlerConfig>>;

type RegisteredHandler = {
  name: string;
  handler: OnBeforeRequestHandler;
};

// The single source of truth for request-manipulation handlers. Handlers run in
// registration order (see `applyOnBeforeRequestHandlers`), so callers register
// in dependency order — there is no separate priority mechanism. A feature
// registers its handlers from its own init flow rather than this module
// hardcoding which handlers exist, so nothing here needs to know about embeds,
// the SDK, or any other consumer.
const registeredHandlers: RegisteredHandler[] = [];

/**
 * Register a request handler under a stable `name`.
 *
 * Re-registering an existing `name` replaces the handler in place, keeping its
 * position in the run order. This lets a flow that rebuilds its handler on
 * re-init — e.g. the SDK session refresh, which closes over a fresh
 * `dispatch`/`authConfig` each time — swap in the latest version without
 * duplicating or reordering. The `name` doubles as a debug label for tracing
 * why an endpoint was rewritten.
 */
export function registerOnBeforeRequestHandler(
  name: string,
  handler: OnBeforeRequestHandler,
) {
  const existing = registeredHandlers.find((entry) => entry.name === name);
  if (existing) {
    existing.handler = handler;
    return;
  }
  registeredHandlers.push({ name, handler });
}

/** Names of the registered handlers, in run order. For debugging and tests. */
export function getOnBeforeRequestHandlerNames(): string[] {
  return registeredHandlers.map((entry) => entry.name);
}

/** Drop all registered handlers. Used by tests and the plugin reinitialize. */
export function clearOnBeforeRequestHandlers() {
  registeredHandlers.length = 0;
}

/**
 * Run every registered handler over the request config, in registration order.
 * Each handler sees the result of the previous one and may return a partial
 * override that is merged in.
 */
export async function applyOnBeforeRequestHandlers(
  requestConfig: OnBeforeRequestHandlerConfig,
): Promise<OnBeforeRequestHandlerConfig> {
  let result = requestConfig;
  for (const { handler } of registeredHandlers) {
    const next = await handler(result);
    if (next) {
      result = merge(result, next);
    }
  }
  return result;
}

function merge(
  prev: OnBeforeRequestHandlerConfig,
  next: Partial<OnBeforeRequestHandlerConfig>,
) {
  const result = { ...prev };

  if (next?.method) {
    result.method = next.method;
  }
  if (next?.url) {
    result.url = next.url;
  }
  if (next?.headers) {
    result.headers = {
      ...(result.headers ?? {}),
      ...next.headers,
    };
  }
  if (next?.data) {
    result.data = {
      ...result.data,
      ...next.data,
    };
  }
  if (next?.body) {
    result.body = {
      ...(result.body ?? {}),
      ...next.body,
    };
  }

  return result;
}
