/* eslint-disable metabase/no-literal-metabase-strings */
import EventEmitter from "events";

import { substituteUrlTags } from "metabase/api/utils/substitute-url-tags";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { PLUGIN_API, PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import type {
  OnBeforeRequestHandler,
  OnBeforeRequestHandlerConfig,
} from "metabase/plugins/oss/api";
import { IFRAMED_IN_SELF, isWithinIframe } from "metabase/utils/iframe";
import { getTraceparentHeader } from "metabase/utils/otel";
import { retry } from "metabase/utils/retry";

const MAX_RETRIES = 10;

const ANTI_CSRF_HEADER = "X-Metabase-Anti-CSRF-Token";
const METABASE_VERSION_HEADER = "X-Metabase-Version";

let ANTI_CSRF_TOKEN: string | null = null;
let LOCALE: string | null = null;

export type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";

type RequestOptions = {
  noEvent?: boolean;
  /**
   * When `true`, resolve with the raw `Response` instead of the parsed body —
   * for callers that read it themselves (binary downloads, map tiles as a
   * blob).
   */
  rawResponse?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type RequestClientInfo = string | { name: string; version: string | null };

/**
 * Legacy API method. Consumers across the codebase pass concrete request shapes
 * (e.g. `CreateDashboardRequest`) and rely on destructuring a concrete response,
 * so we use broad `any` types here to match the JS version's behaviour.
 */
type ApiMethod = (
  rawData?: any,
  invocationOptions?: RequestOptions,
) => Promise<any>;

type MethodCreator = (
  urlTemplate: string,
  methodOptions?: RequestOptions,
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

  buildUrl(template: string, data: Record<string, unknown>): URL {
    const relativePath = substituteUrlTags(template, data);
    return new URL(this.basename.concat(relativePath), location.origin);
  }

  getClientHeaders(
    extraHeaders: Record<string, string> = {},
  ): Record<string, string> {
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

    if (LOCALE) {
      headers["X-Metabase-Locale"] = LOCALE;
    }

    const traceparent = getTraceparentHeader();
    if (traceparent) {
      headers["traceparent"] = traceparent;
    }

    return {
      ...headers,
      ...extraHeaders,
    };
  }

  _makeMethod(
    methodTemplate: RequestMethod,
    withRetries: boolean = false,
  ): MethodCreator {
    return (urlTemplate, methodOptions = {}) => {
      return async (rawData = {}, invocationOptions = {}) => {
        const middlewareResult = await this.apiRequestManipulationMiddleware({
          url: urlTemplate,
          method: methodTemplate,
          options: {
            ...methodOptions,
            ...invocationOptions,
          },
          // this will transform arrays to objects with numeric keys
          // we shouldn't be using top level-arrays in the API
          data: { ...rawData },
        });

        const { method, data } = middlewareResult;
        const options = {
          ...methodOptions,
          ...invocationOptions,
          ...middlewareResult.options,
        };

        // Method-derived placement: POST/PUT/DELETE put data in body, GET
        // puts it in the querystring. `FormData` / `URLSearchParams` rawData
        // is passed straight through so the browser sets the correct
        // Content-Type (multipart with boundary, or `x-www-form-urlencoded`).
        // Callers wanting RTK-style explicit body/params semantics use
        // `request()` below instead.
        const url = this.buildUrl(middlewareResult.url, data);
        let body: string | FormData | URLSearchParams | undefined = undefined;

        const headers = this.getClientHeaders(options.headers);

        if (
          rawData instanceof FormData ||
          rawData instanceof URLSearchParams
        ) {
          body = rawData;
          delete headers["Content-Type"];
        } else if (method === "GET") {
          // GET cannot carry a body: fold any body content into the querystring.
          appendQueryParameters(url, data);
        } else if (Object.keys(data).length > 0) {
          body = JSON.stringify(data);
        }

        const send = () =>
          this._makeRequest(method, url, headers, body, data, options);

        if (withRetries) {
          return retry(send, {
            maxRetries: MAX_RETRIES,
            shouldRetry: isRetriableError,
          });
        }
        return send();
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
  async request<T = unknown>({
    method: methodTemplate,
    url: urlTemplate,
    body: requestBody,
    params,
    ...invocationOptions
  }: {
    method: RequestMethod;
    url: string;
    body?: unknown;
    params?: Record<string, unknown>;
  } & RequestOptions): Promise<T> {
    const middlewareResult = await this.apiRequestManipulationMiddleware({
      url: urlTemplate,
      method: methodTemplate,
      options: invocationOptions,
      data: { ...params },
    });

    const { method, data } = middlewareResult;
    const options = {
      ...invocationOptions,
      ...middlewareResult.options,
    };

    const url = this.buildUrl(middlewareResult.url, data);
    const headers = this.getClientHeaders(options.headers);
    let body: string | FormData | URLSearchParams | undefined = undefined;

    // Leftover params (post URL-tag substitution) always go to the querystring.
    appendQueryParameters(url, data);

    if (method === "GET") {
      // GET cannot carry a body: fold any body content into the querystring.
      const params = (requestBody ?? {}) as Record<string, unknown>;
      appendQueryParameters(url, params);
    } else if (
      requestBody instanceof FormData ||
      requestBody instanceof URLSearchParams
    ) {
      body = requestBody;

      // Let the browser set Content-Type with the multipart boundary
      // (FormData) or urlencoded charset (URLSearchParams).
      delete headers["Content-Type"];
    } else if (requestBody !== undefined) {
      body = JSON.stringify(requestBody);
    }

    // RTK callers don't retry; matches the prior behavior where apiQuery never
    // opted into retries.
    return this._makeRequest<T>(method, url, headers, body, data, options);
  }

  async _makeRequest<T = unknown>(
    method: string,
    url: URL,
    headers: Record<string, string>,
    requestBody: string | FormData | URLSearchParams | undefined,
    data: Record<string, unknown>,
    options: RequestOptions<T>,
  ): Promise<T> {
    // We bridge `options.signal` through a local controller (rather than
    // handing it to `fetch` directly) so an already-aborted signal still gets
    // its request dispatched: the request is sent this microtask, then the
    // local controller aborts on the next. This matches XHR's `send()` →
    // `abort()` semantics and keeps superseded-but-parked requests (e.g.
    // through the embedding-SDK token refresh) going out.
    const controller = new AbortController();
    const request = new Request(url.href, {
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

    try {
      const response = await fetch(request);
      const unreadResponse = response.clone();
      const bodyText = await response.text();
      // An empty body (e.g. 204 No Content) surfaces as `null`, not `""`,
      // so callers don't have to handle "the response was empty" via
      // per-endpoint `transformResponse` workarounds.
      let body: unknown = response.status === 204 ? null : bodyText;

      if (bodyText !== "") {
        try {
          body = JSON.parse(bodyText);
        } catch (e) {}
      }

      const status = getResponseStatus(response, body);
      const token = response.headers.get(ANTI_CSRF_HEADER);
      const metabaseVersion = response.headers.get(METABASE_VERSION_HEADER);

      if (token) {
        ANTI_CSRF_TOKEN = token;
      }

      if (!options.noEvent) {
        // Strip basename so listeners (app-main.js) see the relative path.
        const emitPath = url.pathname.startsWith(this.basename)
          ? url.pathname.slice(this.basename.length)
          : url.pathname;
        this.emit(status, emitPath + url.search);
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
    } catch (error: unknown) {
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
    }
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
  LOCALE = locale ?? null;
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

function isRetriableError(error: unknown): boolean {
  return getErrorStatus(error) === 503;
}

function getResponseStatus(response: Response, body: unknown): number {
  if (
    response.status === 202 &&
    body &&
    typeof body === "object" &&
    "_status" in body &&
    typeof body._status === "number" &&
    body._status > 0
  ) {
    return body._status;
  }

  return response.status;
}

function appendQueryParameters(url: URL, params: Record<string, unknown>) {
  for (const key in params) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.append(key, String(value));
    }
  }
}
