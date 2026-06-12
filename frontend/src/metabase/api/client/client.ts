/* eslint-disable metabase/no-literal-metabase-strings */
import EventEmitter from "events";

import { IFRAMED_IN_SELF, isWithinIframe } from "metabase/utils/iframe";
import { getTraceparentHeader } from "metabase/utils/otel";
import { retry } from "metabase/utils/retry";

import { addAntiCsrfToken, updateAntiCsrfToken } from "./csrf";
import { NetworkError, isRetriableError } from "./errors";
import { getLocaleHeader } from "./locale";
import { type RequestMethod, isRequestMethod } from "./method";
import {
  type OnBeforeRequestHandlerConfig,
  applyOnBeforeRequestHandlers,
} from "./middleware";
import type {
  EventMap,
  RequestClientInfo,
  RequestInit,
  RequestOptions,
  ResponseFor,
} from "./types";
import {
  appendQueryParameters,
  handleResponse,
  relativeUrl,
  substituteUrlTags,
} from "./utils";

const MAX_RETRIES = 10;

export class ApiClient extends EventEmitter<EventMap> {
  basename = "";
  apiKey = "";
  sessionToken: string | undefined;
  requestClient: RequestClientInfo | undefined;
  // Set to `true` by the embedding SDK entry points. Read here (rather than
  // importing `isEmbeddingSdk`) so `metabase/api` stays free of SDK imports —
  // the same inversion as `apiKey`/`sessionToken`/`requestClient`.
  isEmbeddingSdk = false;

  private buildUrl(
    template: string,
    data: Record<string, unknown>,
    body?: Record<string, unknown>,
  ): URL {
    const relativePath = substituteUrlTags(template, data, body);
    return new URL(this.basename.concat(relativePath), location.origin);
  }

  private getClientHeaders(
    extraHeaders: Record<string, string> = {},
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["X-Api-Key"] = this.apiKey;
    }

    if (this.sessionToken) {
      headers["X-Metabase-Session"] = this.sessionToken;
    }

    if (isWithinIframe() && !this.isEmbeddingSdk) {
      headers["X-Metabase-Embedded"] = "true";
    }

    if (this.requestClient) {
      if (IFRAMED_IN_SELF) {
        headers["X-Metabase-Embedded-Preview"] = "true";
      }
      if (typeof this.requestClient === "object") {
        headers["X-Metabase-Client"] = this.requestClient.name;
        if (this.requestClient.version) {
          headers["X-Metabase-Client-Version"] = this.requestClient.version;
        }
      } else {
        headers["X-Metabase-Client"] = this.requestClient;
      }
    }

    const locale = getLocaleHeader();
    if (locale) {
      headers["X-Metabase-Locale"] = locale;
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

  private async _resolveOptions(options: OnBeforeRequestHandlerConfig) {
    const middlewareResult = await applyOnBeforeRequestHandlers({
      ...options,
      // `headers` is optional on the public API, but handlers may merge into
      // it, so always hand the pipeline a real object to spread into.
      headers: options.headers ?? {},
      // This will transform arrays to objects with numeric keys
      // we shouldn't be using top level-arrays in the API.
      // Both bags are defensively copied so middleware can safely mutate them.
      data: { ...options.data },
      body: options.body ? { ...options.body } : undefined,
    });

    return {
      ...middlewareResult,
      url: this.buildUrl(
        middlewareResult.url,
        middlewareResult.data,
        middlewareResult.body,
      ),
      headers: this.getClientHeaders(middlewareResult.headers),
    };
  }

  private async _dispatch(
    init: RequestInit,
    withRetries: boolean = false,
  ): Promise<unknown> {
    if (!isRequestMethod(init.method)) {
      throw new Error("Invalid HTTP method");
    }

    try {
      if (withRetries) {
        return await retry(() => this._makeRequest(init), {
          maxRetries: MAX_RETRIES,
          shouldRetry: isRetriableError,
          signal: init.signal,
        });
      }
      return await this._makeRequest(init);
    } catch (error) {
      // When the request is aborted, `fetch` rejects with the standard
      // `DOMException` of name "AbortError". Let it propagate untouched so
      // callers can `isAbortError`-check the standard web shape instead of a
      // bespoke `{ isCancelled }` flag.
      if (init.signal?.aborted) {
        throw error;
      }
      // A genuine transport failure (server dropped the connection, DNS
      // lookup failed, offline) is the one case where `fetch` itself rejects,
      // and per the Fetch spec it always rejects with a `TypeError`. Wrap only
      // that so downstream renderers can `isNetworkError`-check and route it to
      // the connectivity error message. Any other `Error` here — notably a
      // `SyntaxError` from `response.json()` on an empty or malformed body — is
      // a response/parse problem, not a transport failure, so let it pass
      // through unwrapped instead of misclassifying it as a NetworkError.
      if (error instanceof TypeError) {
        throw new NetworkError(error.message);
      }
      throw error;
    }
  }

  /**
   * Run the request over the network: build an explicit `Request`, attach the
   * anti-CSRF token, `fetch`, and capture the anti-CSRF token from the response.
   * Returns the raw `Response` untouched — no body read, status check, or events.
   */
  private async _fetch({ url, ...init }: RequestInit): Promise<Response> {
    // We wrap the fetch args in an explicit `Request` (instead of just calling
    // `fetch(url, init)`) so fetch-mock populates `call.request` on every
    // recorded call. `findRequests()` in our Jest helpers reads `call.request`
    // to filter by method; without the Request object that field is undefined
    // and the helper returns nothing.
    const request = new Request(url, init);

    addAntiCsrfToken(request);

    const response = await fetch(request);

    updateAntiCsrfToken(response);

    return response;
  }

  private async _makeRequest<RawResponse extends boolean>(
    init: RequestInit<RawResponse>,
  ): Promise<ResponseFor<RawResponse>> {
    const response = await this._fetch(init);

    const { ok, status, body } = await handleResponse(
      response,
      init.rawResponse,
    );

    if (!init.noEvent && (status === 401 || status === 403)) {
      // Strip basename so listeners (app-main.js) see the relative path.
      const path = relativeUrl(this.basename, init.url);
      this.emit(status, path);
    }

    if (!ok) {
      const metabaseVersion = response.headers.get("X-Metabase-Version");
      this.emit("responseError", { metabaseVersion });
      throw { status, data: body };
    }

    return body as ResponseFor<RawResponse>;
  }

  /**
   * Resolve options through the middleware pipeline and assemble a `RequestInit`:
   * URL (basename + `:tag` substitution), client headers, and body placement.
   * Shared by `request` and `fetch`.
   *
   * Body/params semantics:
   * - `params`: URL `:tag` substitution first, leftover keys become querystring.
   * - `body`: sent as the request body. `FormData` / `URLSearchParams` are
   *   forwarded as-is so the browser sets the right Content-Type. Anything
   *   else is `JSON.stringify`'d. For `GET` it's folded into the querystring.
   *   Body fields can also fill URL `:tag`s a handler introduces (the embed
   *   `:token` rewrite), and any tag-consumed field drops out of the body.
   */
  private async _prepareRequest(
    options: {
      method: RequestMethod;
      url: string;
      body?: unknown;
      params?: Record<string, unknown>;
    } & RequestOptions,
  ): Promise<RequestInit> {
    if (Array.isArray(options.body)) {
      throw new Error("API bodies must be plain objects, not arrays");
    }

    const bodyIsRaw =
      options.body instanceof FormData ||
      options.body instanceof URLSearchParams;

    // Hand the middleware `params` and `body` as separate channels (`data` vs
    // `body`). URL-tag substitution pulls from either — so the embed override
    // fills `:token` from the body — and what's left stays sorted into its own
    // bag, so there's nothing to unweave afterwards. `FormData` /
    // `URLSearchParams` can't be inspected, so they skip the body channel and
    // attach as-is below.
    const {
      url,
      method,
      data,
      body: resolvedBody,
      headers,
    } = await this._resolveOptions({
      url: options.url,
      method: options.method,
      headers: options.headers,
      data: options.params ?? {},
      body: bodyIsRaw
        ? undefined
        : (options.body as Record<string, unknown> | undefined),
    });

    let body: BodyInit | undefined = undefined;

    // Leftover params (post URL-tag substitution) always go to the querystring.
    appendQueryParameters(url, data);

    if (method === "GET") {
      // GET cannot carry a body: fold the leftover body fields into the
      // querystring too.
      if (resolvedBody) {
        appendQueryParameters(url, resolvedBody);
      }
    } else if (bodyIsRaw) {
      body = options.body as BodyInit;

      // Let the browser set Content-Type with the multipart boundary
      // (FormData) or urlencoded charset (URLSearchParams).
      delete headers["Content-Type"];
    } else if (options.body !== undefined) {
      body = JSON.stringify(resolvedBody ?? {});
    }

    return { ...options, url, method, headers, body };
  }

  /**
   * RTK Query entry point with explicit body/params semantics. Reads and parses
   * the body, throwing `{ status, data }` on a non-2xx response. Pass
   * `rawResponse: true` to resolve with the raw `Response` instead. Pass
   * `retry: true` for the legacy retry-on-transient-failure behavior used by
   * the GET/POST helpers; RTK callers leave it off.
   */
  async request<Raw extends boolean = false>(
    options: {
      method: RequestMethod;
      url: string;
      body?: unknown;
      params?: Record<string, unknown>;
      retry?: boolean;
    } & RequestOptions<Raw>,
  ): Promise<ResponseFor<Raw>> {
    const init = await this._prepareRequest(options);
    return this._dispatch(init, options.retry ?? false) as ResponseFor<Raw>;
  }

  /**
   * Resolve with the raw `Response`, leaving everything after the network to the
   * caller: unlike `request`, it does not read the body, recover a 202 `_status`,
   * emit events, or throw on a non-2xx status. For streaming callers (e.g. SSE)
   * that consume `response.body` and do their own error handling, while still
   * getting the client pipeline — middleware, client headers, anti-CSRF, and
   * basename resolution — that a hand-rolled `fetch` would otherwise miss.
   */
  async fetch(
    options: {
      method: RequestMethod;
      url: string;
      body?: unknown;
      params?: Record<string, unknown>;
    } & RequestOptions,
  ): Promise<Response> {
    const init = await this._prepareRequest(options);
    return this._fetch(init);
  }

  /**
   * Builds a legacy `GET`/`POST`/`PUT`/`DELETE` helper bound to a URL template.
   * Legacy callers pack URL `:tag` values and body fields into a single
   * `rawData` bag, which flows through middleware as `data` — letting handlers
   * like the embed URL override substitute `:tag` tokens from fields that
   * morally live in the body. After URL-tag substitution the leftover bag
   * becomes the JSON body (POST/PUT) or the querystring (GET/DELETE).
   * FormData / URLSearchParams sidestep this and go through as-is.
   *
   * @deprecated Call `api.request(...)` directly with explicit `body`/`params`.
   * TODO: remove once `metabase/services` and the remaining legacy callers
   * (see `rg "from .metabase/api/legacy-client.""`) move to `api.request`.
   */
  private makeMethod(method: RequestMethod, retry: boolean) {
    const hasBody = method === "POST" || method === "PUT";
    return (urlTemplate: string, methodOptions: RequestOptions = {}) =>
      async <Raw extends boolean = false>(
        rawData: any = {},
        invocationOptions: RequestOptions<Raw> = {},
      ): Promise<Raw extends true ? Response : any> => {
        const options = { ...methodOptions, ...invocationOptions };
        const headers = {
          ...methodOptions.headers,
          ...invocationOptions.headers,
        };

        if (rawData instanceof FormData || rawData instanceof URLSearchParams) {
          const resolved = await this._resolveOptions({
            url: urlTemplate,
            method,
            headers,
            data: {},
          });
          // Let the browser set Content-Type with the multipart boundary
          // (FormData) or urlencoded charset (URLSearchParams).
          delete resolved.headers["Content-Type"];
          return this._dispatch(
            { ...options, ...resolved, body: rawData },
            retry,
          ) as any;
        }

        const resolved = await this._resolveOptions({
          url: urlTemplate,
          method,
          headers,
          data: rawData,
        });

        let body: BodyInit | undefined = undefined;
        if (hasBody && resolved.method !== "GET") {
          // Leftover bag → JSON body. Middleware saw the whole bag, so embed
          // URL `:token` etc. were already substituted from it.
          body = JSON.stringify(resolved.data);
        } else {
          // GET (including POST/PUT overridden to GET by middleware) and
          // DELETE: leftover bag goes to the querystring. `fetch` rejects
          // GET-with-body, so the override POST→GET embed case lands here too
          // — matching the old XHR path that silently dropped the body.
          appendQueryParameters(resolved.url, resolved.data);
        }

        return this._dispatch({ ...options, ...resolved, body }, retry) as any;
      };
  }

  /** @deprecated Use `api.request({ method: "GET", ... })` instead. */
  GET = this.makeMethod("GET", true);
  /** @deprecated Use `api.request({ method: "POST", ... })` instead. */
  POST = this.makeMethod("POST", true);
  /** @deprecated Use `api.request({ method: "PUT", ... })` instead. */
  PUT = this.makeMethod("PUT", false);
  /** @deprecated Use `api.request({ method: "DELETE", ... })` instead. */
  DELETE = this.makeMethod("DELETE", false);
}

export const api = new ApiClient();
