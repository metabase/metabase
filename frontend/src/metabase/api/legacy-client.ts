/* eslint-disable metabase/no-literal-metabase-strings */
import EventEmitter from "events";
import querystring from "querystring";

import { substituteUrlTags } from "metabase/api/utils/substitute-url-tags";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { PLUGIN_API, PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import type {
  OnBeforeRequestHandler,
  OnBeforeRequestHandlerConfig,
} from "metabase/plugins/oss/api";
import { IFRAMED_IN_SELF, isWithinIframe } from "metabase/utils/iframe";
import { getTraceparentHeader } from "metabase/utils/otel";
import { delay } from "metabase/utils/promise";

const ONE_SECOND = 1000;
const MAX_RETRIES = 10;
// Exponential backoff in millis: [1000, 2000, 4000, 8000...]
const RETRY_DELAY_INTERVALS = new Array(MAX_RETRIES)
  .fill(1)
  .map((_, i) => ONE_SECOND * Math.pow(2, i));

const ANTI_CSRF_HEADER = "X-Metabase-Anti-CSRF-Token";
const METABASE_VERSION_HEADER = "X-Metabase-Version";

let ANTI_CSRF_TOKEN: string | null = null;

type RequestOptions = {
  noEvent: boolean;
  /**
   * When `true`, resolve with the raw `Response` instead of the parsed body —
   * for callers that read it themselves (binary downloads, map tiles as a
   * blob). Implies the fetch path (XHR has no `Response` object).
   */
  rawResponse?: boolean;
  headers: Record<string, string>;
  signal?: AbortSignal;
};

const DEFAULT_OPTIONS: RequestOptions = {
  noEvent: false,
  headers: {},
};

type RequestClientInfo = string | { name: string; version: string | null };

/**
 * Legacy API method. Consumers across the codebase pass concrete request shapes
 * (e.g. `CreateDashboardRequest`) and rely on destructuring a concrete response,
 * so we use broad `any` types here to match the JS version's behaviour.
 */
type ApiMethod = (
  rawData?: any,
  invocationOptions?: Partial<RequestOptions>,
) => Promise<any>;

type MethodCreator = (
  urlTemplate: string,
  methodOptions?: Partial<RequestOptions>,
) => ApiMethod;

/**
 * Thrown when the transport itself fails before a response is received —
 * e.g. the server dropped the connection, DNS lookup failed, or the user is
 * offline. Callers can `instanceof`-check this to render a connectivity
 * error message instead of treating it as a generic JS exception.
 */
export class NetworkError extends Error {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * The standard web-platform shape for a cancelled request: an `Error` whose
 * `name` is `"AbortError"`. `fetch()` rejects with a `DOMException` of this
 * shape on abort, and we throw the same from the XHR path so both transports
 * line up. Use `isAbortError` to narrow.
 */
export type AbortError = Error & { name: "AbortError" };

/**
 * Type guard for the standard `AbortError` that `fetch()` (and
 * `XMLHttpRequest.abort()`-driven rejections) surface when the request is
 * cancelled. Replaces the legacy `error.isCancelled` flag.
 */
export function isAbortError(error: unknown): error is AbortError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

type ResponseErrorInfo = {
  body: unknown;
  status: number;
  metabaseVersion: string | null;
};

type EventMap = {
  // Per-status events. Listeners receive the request URL (with basename
  // stripped so subscribers see the relative path).
  [status: number]: [string];
  // Fired for any non-2xx response. Payload includes the response body so
  // callers can inspect the failure beyond just its status.
  responseError: [ResponseErrorInfo];
};

export class LegacyApi extends EventEmitter<EventMap> {
  basename = "";
  apiKey = "";
  sessionToken: string | undefined;
  requestClient: RequestClientInfo | undefined;

  beforeRequestHandlers: OnBeforeRequestHandler[] = [];

  GET: MethodCreator;
  POST: MethodCreator;
  PUT: MethodCreator;
  DELETE: MethodCreator;

  constructor() {
    super();
    this.GET = this._makeMethod("GET", true);
    this.DELETE = this._makeMethod("DELETE", false);
    this.POST = this._makeMethod("POST", true);
    this.PUT = this._makeMethod("PUT", false);
  }

  getClientHeaders(): Record<string, string> {
    const self = this;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["X-Api-Key"] = self.apiKey;
    }

    if (this.sessionToken) {
      headers["X-Metabase-Session"] = self.sessionToken!;
    }

    if (isWithinIframe() && !isEmbeddingSdk()) {
      headers["X-Metabase-Embedded"] = "true";
    }

    if (self.requestClient) {
      if (IFRAMED_IN_SELF) {
        headers["X-Metabase-Embedded-Preview"] = "true";
      }
      if (typeof self.requestClient === "object") {
        headers["X-Metabase-Client"] = self.requestClient.name;
        if (self.requestClient.version) {
          headers["X-Metabase-Client-Version"] = self.requestClient.version;
        }
      } else {
        headers["X-Metabase-Client"] = self.requestClient;
      }
    }

    if (ANTI_CSRF_TOKEN) {
      headers[ANTI_CSRF_HEADER] = ANTI_CSRF_TOKEN;
    }

    if (DEFAULT_OPTIONS.headers["X-Metabase-Locale"]) {
      headers["X-Metabase-Locale"] =
        DEFAULT_OPTIONS.headers["X-Metabase-Locale"];
    }

    const traceparent = getTraceparentHeader();
    if (traceparent) {
      headers["traceparent"] = traceparent;
    }

    return headers;
  }

  _makeMethod(methodTemplate: string, retry: boolean = false): MethodCreator {
    return (urlTemplate, methodOptions = {}) => {
      const defaultOptions: RequestOptions = {
        ...DEFAULT_OPTIONS,
        ...methodOptions,
      };

      return async (rawData = {}, invocationOptions = {}) => {
        const middlewareResult = await this.apiRequestManipulationMiddleware({
          url: urlTemplate,
          method: methodTemplate as "GET" | "POST",
          options: {
            ...defaultOptions,
            ...invocationOptions,
          } as OnBeforeRequestHandlerConfig["options"],
          // this will transform arrays to objects with numeric keys
          // we shouldn't be using top level-arrays in the API
          data: { ...rawData },
        });
        let { url, method } = middlewareResult;
        // Re-merge to preserve all RequestOptions fields after middleware (middleware can only extend options)
        const options: RequestOptions = {
          ...defaultOptions,
          ...invocationOptions,
          ...middlewareResult.options,
        } as RequestOptions;
        const { data } = middlewareResult;
        url = substituteUrlTags(url, data, method);
        // remove undefined
        for (const name in data) {
          if (data[name] === undefined) {
            delete data[name];
          }
        }

        // Determine body and querystring.
        // - `options.body` / `options.params`: explicit RTK Query convention.
        // - `FormData` / `URLSearchParams` rawData: passed straight through so
        //   the browser sets the correct Content-Type (multipart with boundary,
        //   or `application/x-www-form-urlencoded`).
        // - Otherwise: legacy single-data-object — body for POST/PUT/DELETE,
        //   querystring for GET. GET requests can't carry a body, so any body
        //   content (explicit or legacy) is folded into the querystring.
        let body: string | FormData | URLSearchParams | undefined;
        const queryStringRecord: Record<string, unknown> = {};

        if (
          rawData instanceof FormData ||
          rawData instanceof URLSearchParams
        ) {
          body = rawData;
          if (options.params) {
            Object.assign(queryStringRecord, options.params);
          }
        } else if (method === "GET") {
          // GET cannot carry a body: merge everything into the querystring.
          Object.assign(
            queryStringRecord,
            data,
            options.body as Record<string, unknown> | undefined,
            options.params,
          );
        } else if (options.body !== undefined || options.params !== undefined) {
          if (options.body !== undefined) {
            body = JSON.stringify(options.body);
          }
          if (options.params) {
            Object.assign(queryStringRecord, options.params);
          }
        } else if (Object.keys(data).length > 0) {
          body = JSON.stringify(data);
        }

        const qs = querystring.stringify(
          queryStringRecord as Record<string, string>,
        );
        if (qs) {
          url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
        }

        const headers = this._buildHeaders(options);
        if (body instanceof FormData || body instanceof URLSearchParams) {
          delete headers["Content-Type"];
        }

        return this._dispatch({
          method,
          url,
          headers,
          body,
          data,
          options,
          retry,
        });
      };
    };
  }

  /**
   * RTK Query entry point with explicit body/params semantics:
   * - `body`: sent as the request body. `FormData` / `URLSearchParams` are
   *   forwarded as-is so the browser sets the right Content-Type. Anything
   *   else is `JSON.stringify`'d. For `GET` it's folded into the querystring.
   * - `params`: URL `:tag` substitution first, leftover keys become querystring.
   *
   * No method-derived guesswork about whether data is body or querystring.
   */
  async request({
    method,
    url: urlTemplate,
    body: requestBody,
    params,
    signal,
    noEvent,
    rawResponse,
    headers: headerOverrides,
    raw,
  }: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    url: string;
    body?: unknown;
    params?: Record<string, unknown>;
    signal?: AbortSignal;
    noEvent?: boolean;
    rawResponse?: boolean;
    headers?: Record<string, string>;
    raw?: Record<string, boolean>;
  }): Promise<unknown> {
    const invocationOptions: Partial<RequestOptions> = {
      signal,
      ...(noEvent !== undefined ? { noEvent } : {}),
      ...(rawResponse !== undefined ? { rawResponse } : {}),
      ...(headerOverrides ? { headers: headerOverrides } : {}),
      ...(raw ? { raw } : {}),
    };

    const middlewareResult = await this.apiRequestManipulationMiddleware({
      url: urlTemplate,
      method: method as "GET" | "POST",
      options: {
        ...DEFAULT_OPTIONS,
        ...invocationOptions,
      } as OnBeforeRequestHandlerConfig["options"],
      data: { ...params },
    });

    let { url, method: finalMethod } = middlewareResult;
    const options: RequestOptions = {
      ...DEFAULT_OPTIONS,
      ...invocationOptions,
      ...middlewareResult.options,
    } as RequestOptions;
    const { data } = middlewareResult;

    for (const tag of url.match(/:\w+/g) || []) {
      const paramName = tag.slice(1);
      let value = data[paramName];
      delete data[paramName];
      if (value === undefined) {
        console.warn("Warning: calling", finalMethod, "without", tag);
        value = "";
      }
      if (!options.raw || !options.raw[paramName]) {
        value = encodeURIComponent(value as string);
      }
      url = url.replace(tag, value as string);
    }
    for (const name in data) {
      if (data[name] === undefined) {
        delete data[name];
      }
    }

    let body: string | FormData | URLSearchParams | undefined;
    const queryStringRecord: Record<string, unknown> = { ...data };
    const bodyIsRaw =
      requestBody instanceof FormData || requestBody instanceof URLSearchParams;

    if (finalMethod === "GET") {
      // GET cannot carry a body: fold any body content into the querystring.
      Object.assign(
        queryStringRecord,
        requestBody as Record<string, unknown> | undefined,
      );
    } else if (bodyIsRaw) {
      body = requestBody as FormData | URLSearchParams;
    } else if (requestBody !== undefined) {
      body = JSON.stringify(requestBody);
    }

    const qs = querystring.stringify(
      queryStringRecord as Record<string, string>,
    );
    if (qs) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
    }

    const headers = this._buildHeaders(options);
    if (bodyIsRaw) {
      // Let the browser set Content-Type with the multipart boundary
      // (FormData) or urlencoded charset (URLSearchParams).
      delete headers["Content-Type"];
    }

    // RTK callers don't retry; matches the prior behavior where apiQuery never
    // set `retry: true`.
    return this._dispatch({
      method: finalMethod,
      url,
      headers,
      body,
      data,
      options,
      retry: false,
    });
  }

  _buildHeaders(options: RequestOptions): Record<string, string> {
    return {
      ...this.getClientHeaders(),
      ...options.headers,
    };
  }

  _dispatch({
    method,
    url,
    headers,
    body,
    data,
    options,
    retry,
  }: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | FormData | URLSearchParams | undefined;
    data: Record<string, unknown>;
    options: RequestOptions;
    retry: boolean;
  }): Promise<unknown> {
    if (retry) {
      return this._makeRequestWithRetries(
        method,
        url,
        headers,
        body,
        data,
        options,
      );
    }
    return this._makeRequest(method, url, headers, body, data, options);
  }

  async _makeRequestWithRetries(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | FormData | URLSearchParams | undefined,
    data: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<unknown> {
    // Attempt the request; on 503 retry up to MAX_RETRIES times, waiting for
    // each successive backoff interval before the next attempt.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this._makeRequest(
          method,
          url,
          headers,
          body,
          data,
          options,
        );
      } catch (error) {
        if (getErrorStatus(error) !== 503 || attempt >= MAX_RETRIES) {
          throw error;
        }
        // Honor a mid-backoff abort: stop sleeping and surface the standard
        // AbortError. Without this, an aborted request still waits for the
        // remaining backoff before bailing.
        await delay(RETRY_DELAY_INTERVALS[attempt], options.signal);
        if (options.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
      }
    }
  }

  async _makeRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    requestBody: string | FormData | URLSearchParams | undefined,
    data: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<unknown> {
    // We bridge `options.signal` through a local controller (rather than
    // handing it to `fetch` directly) so an already-aborted signal still gets
    // its request dispatched: the request is sent this microtask, then the
    // local controller aborts on the next. This matches XHR's `send()` →
    // `abort()` semantics and keeps superseded-but-parked requests (e.g.
    // through the embedding-SDK token refresh) going out.
    const controller = new AbortController();
    const requestUrl = new URL(this.basename + url, location.origin);
    const request = new Request(requestUrl.href, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    if (options.signal) {
      if (options.signal.aborted) {
        queueMicrotask(() => controller.abort());
      } else {
        options.signal.addEventListener("abort", () => controller.abort());
      }
    }

    return fetch(request)
      .then((response) => {
        const unreadResponse = response.clone();
        return response.text().then((bodyText) => {
          // An empty body (e.g. 204 No Content) surfaces as `null`, not `""`,
          // so callers don't have to handle "the response was empty" via
          // per-endpoint `transformResponse` workarounds.
          let body: string | Response | null | undefined =
            response.status === 204 ? null : bodyText;

          if (bodyText !== "") {
            try {
              body = JSON.parse(bodyText);
            } catch (e) {}
          }

          let status = response.status;
          if (
            status === 202 &&
            body &&
            typeof body === "object" &&
            "_status" in body &&
            body._status &&
            (body._status as number) > 0
          ) {
            status = (body as Record<string, number>)._status;
          }

          const token = response.headers.get(ANTI_CSRF_HEADER);
          const metabaseVersion = response.headers.get(METABASE_VERSION_HEADER);

          if (token) {
            ANTI_CSRF_TOKEN = token;
          }

          if (!options.noEvent) {
            this.emit(status, url);
          }

          if (status >= 200 && status <= 299) {
            // `rawResponse` callers (binary downloads, map tiles) want the
            // `Response` object itself rather than the parsed body — return
            // the unread clone so they can `.blob()`/`.arrayBuffer()` it.
            return options.rawResponse ? unreadResponse : body;
          } else {
            this.emit("responseError", { body, status, metabaseVersion });

            throw { status: status, data: body };
          }
        });
      })
      .catch((error: unknown) => {
        // When the request is aborted, `fetch` rejects with the standard
        // `DOMException` AbortError. Let it propagate untouched so callers
        // can `isAbortError`-check the standard web shape.
        if (options.signal?.aborted) {
          throw error;
        }
        // A raw `fetch` rejection (e.g. the server dropped the connection)
        // surfaces as a plain Error here, indistinguishable from JS
        // exceptions thrown elsewhere. Wrap it so downstream renderers can
        // `instanceof NetworkError`-check and route it to the connectivity
        // error message.
        if (error instanceof Error) {
          throw new NetworkError(error.message);
        }
        throw error;
      });
  }

  async apiRequestManipulationMiddleware(
    requestConfig: OnBeforeRequestHandlerConfig,
  ): Promise<OnBeforeRequestHandlerConfig> {
    let { method, url, options, data } = requestConfig;

    /**
     * Handlers order is important.
     * Handlers are executed in order and each handler uses the data returned by a previous handler.
     */
    const handlers: Array<
      (
        data: OnBeforeRequestHandlerConfig,
      ) => Promise<void | OnBeforeRequestHandlerConfig>
    > = [];

    if (isEmbeddingSdk()) {
      handlers.push(
        ...[
          PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers
            .getOrRefreshSessionHandler,
          PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers
            .getOrRefreshGuestSessionHandler,
          PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers
            .overrideRequestsForGuestEmbeds,
        ],
      );
    } else {
      handlers.push(
        ...[
          PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForPublicEmbeds,
          PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForStaticEmbeds,
        ],
      );
    }

    handlers.push(...this.beforeRequestHandlers);

    if (handlers.length) {
      for (const handler of handlers) {
        const onBeforeRequestHandlerResult = await handler({
          method,
          url,
          options,
          data,
        });

        if (onBeforeRequestHandlerResult) {
          if (onBeforeRequestHandlerResult.method) {
            method = onBeforeRequestHandlerResult.method;
          }

          if (onBeforeRequestHandlerResult.url) {
            url = onBeforeRequestHandlerResult.url;
          }

          if (onBeforeRequestHandlerResult.options) {
            options = {
              ...options,
              ...onBeforeRequestHandlerResult.options,
            };
          }

          if (onBeforeRequestHandlerResult.data) {
            data = {
              ...data,
              ...onBeforeRequestHandlerResult.data,
            };
          }
        }
      }
    }

    return { method, url, options, data };
  }
}

const instance = new LegacyApi();

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default instance;
export const { GET, POST, PUT, DELETE } = instance;

export const setLocaleHeader = (locale: string | null | undefined): void => {
  /* `X-Metabase-Locale` is a header that the BE stores as *user* locale for the scope of the request.
   * We need it to localize downloads. It *currently* only work if there is a user, so it won't work
   * for public/static embedding.
   */
  DEFAULT_OPTIONS.headers["X-Metabase-Locale"] = locale ?? undefined!;
};

function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}
