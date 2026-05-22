/* eslint-disable metabase/no-literal-metabase-strings */
import EventEmitter from "events";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { OnBeforeRequestHandler } from "metabase/plugins/oss/api";
import { IFRAMED_IN_SELF, isWithinIframe } from "metabase/utils/iframe";
import { getTraceparentHeader } from "metabase/utils/otel";
import { retry } from "metabase/utils/retry";

import { addAntiCsrfToken, updateAntiCsrfToken } from "./csrf";
import { NetworkError, isRetriableError } from "./errors";
import { getLocaleHeader } from "./locale";
import { type RequestMethod, isRequestMethod } from "./method";
import { apiRequestManipulationMiddleware } from "./middleware";
import {
  appendQueryParameters,
  getResponseBody,
  getResponseStatus,
  relativeUrl as relativePath,
  substituteUrlTags,
} from "./utils";

const MAX_RETRIES = 10;

type ResponseTransformer<T = unknown> = (opts: {
  /**
   * A cloned, unread `Response` for callers that need raw headers or stream.
   */
  response: Response;
}) => T;

type RequestOptions<T = unknown> = {
  noEvent?: boolean;
  transformResponse?: ResponseTransformer<T>;
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

type ResponseErrorInfo = {
  metabaseVersion: string | null;
};

type EventMap = {
  401: [string];
  403: [string];
  responseError: [ResponseErrorInfo];
};

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

  private _makeMethod(
    methodTemplate: RequestMethod,
    withRetries: boolean = false,
  ): MethodCreator {
    return (urlTemplate, methodOptions = {}) => {
      return async (rawData = {}, invocationOptions = {}) => {
        const middlewareResult = await apiRequestManipulationMiddleware(
          this.beforeRequestHandlers,
          {
            url: urlTemplate,
            method: methodTemplate,
            options: {
              ...methodOptions,
              ...invocationOptions,
            },
            // this will transform arrays to objects with numeric keys
            // we shouldn't be using top level-arrays in the API
            data: { ...rawData },
          },
        );

        const { method, data } = middlewareResult;
        const options = {
          ...methodOptions,
          ...invocationOptions,
          ...middlewareResult.options,
        };

        // Method-derived placement: POST/PUT/DELETE put data in body, GET
        // puts it in the querystring. Callers wanting RTK-style explicit
        // body/params semantics use `request()` below instead.
        const url = this.buildUrl(middlewareResult.url, data);
        let body: string | undefined = undefined;

        const headers = this.getClientHeaders(options.headers);

        if (method === "GET") {
          // GET cannot carry a body: fold any body content into the querystring.
          appendQueryParameters(url, data);
        } else if (Object.keys(data).length > 0) {
          body = JSON.stringify(data);
        }

        const send = () =>
          this._makeRequest(method, url, headers, body, options);

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
  } & RequestOptions<T>): Promise<T> {
    if (Array.isArray(requestBody)) {
      throw new Error("API bodies must be plain objects, not arrays");
    }

    const middlewareResult = await apiRequestManipulationMiddleware(
      this.beforeRequestHandlers,
      {
        url: urlTemplate,
        method: methodTemplate,
        options: invocationOptions,
        data: { ...params },
      },
    );

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
    return this._makeRequest<T>(method, url, headers, body, options);
  }

  private async _makeRequest<T = unknown>(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body: string | FormData | URLSearchParams | undefined,
    options: RequestOptions<T>,
  ): Promise<T> {
    if (!isRequestMethod(method)) {
      throw new Error("Invalid HTTP method");
    }

    // We wrap the fetch args in an explicit `Request` (instead of just calling
    // `fetch(url, init)`) so fetch-mock populates `call.request` on every
    // recorded call. `findRequests()` in our Jest helpers reads `call.request`
    // to filter by method; without the Request object that field is undefined
    // and the helper returns nothing.
    const request = new Request(url.href, {
      method,
      headers,
      body,
      signal: options.signal,
    });

    try {
      addAntiCsrfToken(request);

      const response = await fetch(request);

      updateAntiCsrfToken(response);

      if (
        !options.noEvent &&
        (response.status === 401 || response.status === 403)
      ) {
        // We can use response.status here, and not the status from getResponseStatus,
        // because streaming responses will never set a _status of 401 or 403.
        //
        // See src/metabase/server/streaming_response.clj
        //
        // Strip basename so listeners (app-main.js) see the relative path.
        const path = relativePath(this.basename, url);
        this.emit(response.status, path);
      }

      const unreadResponse = response.clone();
      const body = await getResponseBody(response);
      const status = getResponseStatus(response, body);

      if (status < 200 || status > 299) {
        const metabaseVersion = response.headers.get("X-Metabase-Version");
        this.emit("responseError", { metabaseVersion });

        throw { status, data: body };
      }

      // If a transformer is given its return value IS `T`. Otherwise the raw
      // body is `unknown`; we trust the caller's `T` annotation.
      if (options.transformResponse) {
        return options.transformResponse({ response: unreadResponse });
      }

      return body as T;
    } catch (error: unknown) {
      if (options.signal?.aborted) {
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
}

export const api = new ApiClient();
