/* eslint-disable metabase/no-literal-metabase-strings */
import EventEmitter from "events";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type {
  OnBeforeRequestHandler,
  OnBeforeRequestHandlerConfig,
} from "metabase/plugins/oss/api";
import { IFRAMED_IN_SELF, isWithinIframe } from "metabase/utils/iframe";
import { getTraceparentHeader } from "metabase/utils/otel";
import { retry } from "metabase/utils/retry";

import { addAntiCsrfToken, updateAntiCsrfToken } from "./csrf";
import { NetworkError, isRetriableError } from "./errors";
import { getLocaleHeader } from "./locale";
import { type RequestMethod, isRequestMethod } from "./method";
import { apiRequestManipulationMiddleware } from "./middleware";
import type {
  EventMap,
  MethodCreator,
  RequestClientInfo,
  RequestInit,
  RequestOptions,
  ResponseFor,
} from "./types";
import {
  appendQueryParameters,
  handleResponse,
  relativeUrl as relativePath,
  substituteUrlTags,
} from "./utils";

const MAX_RETRIES = 10;

export class ApiClient extends EventEmitter<EventMap> {
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

    if (isWithinIframe() && !isEmbeddingSdk()) {
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
    const middlewareResult = await apiRequestManipulationMiddleware(
      this.beforeRequestHandlers,
      {
        ...options,
        // This will transform arrays to objects with numeric keys
        // we shouldn't be using top level-arrays in the API.
        // It also defensively copies the data object, so middleware can safely mutate it.
        data: { ...options.data },
      },
    );

    return {
      ...middlewareResult,
      url: this.buildUrl(middlewareResult.url, middlewareResult.data),
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
      if (init.signal?.aborted) {
        throw { isCancelled: true };
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

  private async _makeRequest<RawResponse extends boolean>({
    url,
    noEvent,
    rawResponse,
    ...init
  }: RequestInit<RawResponse>): Promise<ResponseFor<RawResponse>> {
    // We wrap the fetch args in an explicit `Request` (instead of just calling
    // `fetch(url, init)`) so fetch-mock populates `call.request` on every
    // recorded call. `findRequests()` in our Jest helpers reads `call.request`
    // to filter by method; without the Request object that field is undefined
    // and the helper returns nothing.
    const request = new Request(url, init);

    addAntiCsrfToken(request);

    const response = await fetch(request);

    updateAntiCsrfToken(response);

    const { ok, status, body } = await handleResponse(response, rawResponse);

    if (!noEvent && (status === 401 || status === 403)) {
      // We can use response.status here, and not the status from getResponseStatus,
      // because streaming responses will never set a _status of 401 or 403.
      //
      // See src/metabase/server/streaming_response.clj
      //
      // Strip basename so listeners (app-main.js) see the relative path.
      const path = relativePath(this.basename, url);
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
   * Legacy API method. Consumers across the codebase pass concrete request shapes
   * (e.g. `CreateDashboardRequest`) and rely on destructuring a concrete response,
   * so we use broad `any` types here to match the JS version's behaviour.
   */
  private _makeMethod(
    methodTemplate: RequestMethod,
    withRetries: boolean = false,
  ): MethodCreator {
    return (urlTemplate, methodOptions = {}) => {
      return async (rawData = {}, invocationOptions = {}) => {
        const options = { ...methodOptions, ...invocationOptions };
        const { url, method, data, headers } = await this._resolveOptions({
          url: urlTemplate,
          method: methodTemplate,
          headers: {
            ...methodOptions.headers,
            ...invocationOptions.headers,
          },
          data: rawData,
        });

        // Method-derived placement: POST/PUT/DELETE put data in body, GET
        // puts it in the querystring. Callers wanting RTK-style explicit
        // body/params semantics use `request()` below instead.
        let body: BodyInit | undefined = undefined;
        if (method === "GET") {
          // GET cannot carry a body: fold data into the querystring.
          appendQueryParameters(url, data);
        } else if (Object.keys(data).length > 0) {
          body = JSON.stringify(data);
        }

        // GET/POST/etc. are intentionally `any`-typed (see ApiMethod), and this
        // closure can't name MethodCreator's `Raw`, so we cast to `any` — a
        // literal `rawResponse: true` is still narrowed to `Response` by the
        // `ApiMethod<Raw>` return type at the call site.
        return this._dispatch(
          {
            ...options,
            url,
            method,
            headers,
            body,
          },
          withRetries,
        ) as any;
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
  async request<Raw extends boolean = false>(
    options: {
      method: RequestMethod;
      url: string;
      body?: unknown;
      params?: Record<string, unknown>;
    } & RequestOptions<Raw>,
  ): Promise<ResponseFor<Raw>> {
    if (Array.isArray(options.body)) {
      throw new Error("API bodies must be plain objects, not arrays");
    }

    const { url, method, data, headers } = await this._resolveOptions({
      url: options.url,
      method: options.method,
      headers: options.headers,
      data: options.params ?? {},
    });

    let body: BodyInit | undefined = undefined;

    // Leftover params (post URL-tag substitution) always go to the querystring.
    appendQueryParameters(url, data);

    if (method === "GET") {
      // GET cannot carry a body: fold body into the querystring.
      const bodyParams = (options.body ?? {}) as Record<string, unknown>;
      appendQueryParameters(url, bodyParams);
    } else if (
      options.body instanceof FormData ||
      options.body instanceof URLSearchParams
    ) {
      body = options.body;

      // Let the browser set Content-Type with the multipart boundary
      // (FormData) or urlencoded charset (URLSearchParams).
      delete headers["Content-Type"];
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
    }

    // RTK callers don't retry; matches the prior behavior where apiQuery never
    // opted into retries.
    return this._dispatch({
      ...options,
      url,
      method,
      headers,
      body,
    }) as ResponseFor<Raw>;
  }
}

export const api = new ApiClient();
