/* eslint-disable metabase/no-literal-metabase-strings */
import EventEmitter from "events";
import querystring from "querystring";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isTest } from "metabase/env";
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

const ANTI_CSRF_HEADER = "X-Metabase-Anti-CSRF-Token";
const METABASE_VERSION_HEADER = "X-Metabase-Version";

let ANTI_CSRF_TOKEN: string | null = null;

type RequestOptions = {
  json: boolean;
  hasBody: boolean;
  noEvent: boolean;
  transformResponse: (opts: {
    body: object;
    data?: Record<string, unknown>;
    response?: Response;
  }) => Response | undefined;
  raw: Record<string, boolean>;
  headers: Record<string, string>;
  retry: boolean;
  retryCount: number;
  retryDelayIntervals: number[];
  formData?: boolean;
  fetch?: boolean;
  bodyParamName?: string | null;
  cancelled?: Promise<unknown>;
  controller?: AbortController;
  signal?: AbortSignal;
};

const DEFAULT_OPTIONS: RequestOptions = {
  json: true,
  hasBody: false,
  noEvent: false,
  transformResponse: ({ body }) => body as Response,
  raw: {},
  headers: {},
  retry: false,
  retryCount: MAX_RETRIES,
  // Creates an array with exponential backoff in millis
  // i.e. [1000, 2000, 4000, 8000...]
  retryDelayIntervals: new Array(MAX_RETRIES)
    .fill(1)
    .map((_, i) => ONE_SECOND * Math.pow(2, i)),
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
  methodOptions?:
    | Partial<RequestOptions>
    | ((opts: {
        body: object;
        data?: Record<string, unknown>;
        response?: Response;
      }) => Response | undefined),
) => ApiMethod;

type ResponseErrorInfo = {
  body: unknown;
  status: number;
  metabaseVersion: string | null;
};

export class Api extends EventEmitter {
  basename = "";
  apiKey = "";
  sessionToken: string | undefined;
  onResponseError: ((info: ResponseErrorInfo) => void) | undefined;
  requestClient: RequestClientInfo | undefined;

  beforeRequestHandlers: OnBeforeRequestHandler[] = [];

  GET: MethodCreator;
  POST: MethodCreator;
  PUT: MethodCreator;
  DELETE: MethodCreator;

  constructor() {
    super();
    this.GET = this._makeMethod("GET", { retry: true });
    this.DELETE = this._makeMethod("DELETE", {});
    this.POST = this._makeMethod("POST", { hasBody: true, retry: true });
    this.PUT = this._makeMethod("PUT", { hasBody: true });
  }

  getClientHeaders(): Record<string, string> {
    const self = this;
    const headers: Record<string, string> = {};

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

  _makeMethod(
    methodTemplate: string,
    creatorOptions: Partial<RequestOptions> = {},
  ): MethodCreator {
    return (urlTemplate, methodOptions = {}) => {
      if (typeof methodOptions === "function") {
        methodOptions = { transformResponse: methodOptions };
      }

      const defaultOptions: RequestOptions = {
        ...DEFAULT_OPTIONS,
        ...creatorOptions,
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
        for (const tag of url.match(/:\w+/g) || []) {
          const paramName = tag.slice(1);
          let value = data[paramName];
          delete data[paramName];
          if (value === undefined) {
            console.warn("Warning: calling", method, "without", tag);
            value = "";
          }
          if (!options.raw || !options.raw[paramName]) {
            value = encodeURIComponent(value as string);
          }
          url = url.replace(tag, value as string);
        }
        // remove undefined
        for (const name in data) {
          if (data[name] === undefined) {
            delete data[name];
          }
        }

        let body: string | FormData | undefined;
        if (options.hasBody) {
          body = options.formData
            ? (rawData["formData"] as FormData)
            : JSON.stringify(
                options.bodyParamName != null
                  ? data[options.bodyParamName!]
                  : data,
              );
        } else {
          const qs = querystring.stringify(data as Record<string, string>);
          if (qs) {
            url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
          }
        }

        const headers: Record<string, string> = {
          ...this.getClientHeaders(),
          ...(options.json
            ? { Accept: "application/json", "Content-Type": "application/json" }
            : {}),
          ...options.headers,
        };

        if (options.formData && options.fetch) {
          delete headers["Content-Type"];
        }

        if (options.retry) {
          return this._makeRequestWithRetries(
            method,
            url,
            headers,
            body,
            data,
            options,
          );
        } else {
          return this._makeRequest(method, url, headers, body, data, options);
        }
      };
    };
  }

  async _makeRequestWithRetries(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | FormData | undefined,
    data: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<unknown> {
    // Get a copy of the delay intervals that we can pop items from as we retry
    const retryDelays = options.retryDelayIntervals.slice().reverse();
    let retryCount = 0;
    // maxAttempts is the first attempt followed by the number of retries
    const maxAttempts = options.retryCount + 1;
    // Make the first attempt for the request, then loop incrementing the retryCount
    do {
      try {
        return await this._makeRequest(
          method,
          url,
          headers,
          body,
          data,
          options,
        );
      } catch (e: unknown) {
        retryCount++;
        // If the response is 503 and the next retry won't put us over the maxAttempts,
        // wait a bit and try again
        if (
          (e as { status?: number }).status === 503 &&
          retryCount < maxAttempts
        ) {
          await delay(retryDelays.pop() ?? 0);
        } else {
          throw e;
        }
      }
    } while (retryCount < maxAttempts);
  }

  _makeRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | FormData | undefined,
    data: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<unknown> {
    // this is temporary to not deal with failed cypress tests
    // we should switch to using fetch in all cases (metabase#28489)
    if (isTest || options.fetch) {
      return this._makeRequestWithFetch(
        method,
        url,
        headers,
        body,
        data,
        options,
      );
    } else {
      return this._makeRequestWithXhr(
        method,
        url,
        headers,
        body,
        data,
        options,
      );
    }
  }

  _makeRequestWithXhr(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | FormData | undefined,
    data: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let isCancelled = false;
      const xhr = new XMLHttpRequest();
      xhr.open(method, this.basename + url);
      for (const headerName in headers) {
        xhr.setRequestHeader(headerName, headers[headerName]);
      }
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          // getResponseHeader() is case-insensitive
          const antiCsrfToken = xhr.getResponseHeader(ANTI_CSRF_HEADER);
          const metabaseVersion = xhr.getResponseHeader(
            METABASE_VERSION_HEADER,
          );

          if (antiCsrfToken) {
            ANTI_CSRF_TOKEN = antiCsrfToken;
          }

          let responseBody: Response | string | undefined = xhr.responseText;

          if (options.json) {
            try {
              responseBody = JSON.parse(xhr.responseText);
            } catch (e) {}
          }

          let status = xhr.status;
          if (
            status === 202 &&
            responseBody &&
            typeof responseBody === "object" &&
            "_status" in responseBody &&
            (responseBody._status as number) > 0
          ) {
            status = responseBody._status as number;
          }

          if (status >= 200 && status <= 299) {
            if (options.transformResponse) {
              responseBody = options.transformResponse({
                body: responseBody as Response,
                data,
              });
            }
            resolve(responseBody);
          } else {
            if (this.onResponseError) {
              this.onResponseError({
                body: responseBody,
                status,
                metabaseVersion,
              });
            }

            reject({
              status: status,
              data: responseBody,
              isCancelled: isCancelled,
            });
          }
          if (!options.noEvent) {
            this.emit(String(status), url);
          }
        }
      };
      xhr.send(body);

      if (options.cancelled) {
        options.cancelled.then(() => {
          isCancelled = true;
          xhr.abort();
        });
      }
    });
  }

  async _makeRequestWithFetch(
    method: string,
    url: string,
    headers: Record<string, string>,
    requestBody: string | FormData | undefined,
    data: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<unknown> {
    const controller = options.controller || new AbortController();
    const signal = options.signal ?? controller.signal;
    options.cancelled?.then(() => controller.abort());

    const requestUrl = new URL(this.basename + url, location.origin);
    const request = new Request(requestUrl.href, {
      method,
      headers,
      body: requestBody,
      signal,
    });

    return fetch(request)
      .then((response) => {
        const unreadResponse = response.clone();
        return response.text().then((bodyText) => {
          let body: string | Response | undefined = bodyText;

          if (options.json) {
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
            this.emit(String(status), url);
          }

          if (status >= 200 && status <= 299) {
            if (options.transformResponse) {
              body = options.transformResponse({
                body: body as Response,
                data,
                response: unreadResponse,
              });
            }
            return body;
          } else {
            if (this.onResponseError) {
              this.onResponseError({ body, status, metabaseVersion });
            }

            throw { status: status, data: body };
          }
        });
      })
      .catch((error: unknown) => {
        if (signal.aborted) {
          throw { isCancelled: true };
        } else {
          throw error;
        }
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

const instance = new Api();

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
