/* eslint-disable metabase/no-literal-metabase-strings */
import EventEmitter from "events";
import querystring from "querystring";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isTest } from "metabase/env";
import { isWithinIframe } from "metabase/lib/dom";
import { IFRAMED_IN_SELF } from "metabase/lib/iframe";
import { delay } from "metabase/lib/promise";
import { PLUGIN_API, PLUGIN_EMBEDDING_SDK } from "metabase/plugins";

const ONE_SECOND = 1000;
const MAX_RETRIES = 10;

const ANTI_CSRF_HEADER = "X-Metabase-Anti-CSRF-Token";
const METABASE_VERSION_HEADER = "X-Metabase-Version";

let ANTI_CSRF_TOKEN = null;

const DEFAULT_OPTIONS = {
  json: true,
  hasBody: false,
  noEvent: false,
  transformResponse: ({ body }) => body,
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

export class Api extends EventEmitter {
  basename = "";
  apiKey = "";
  sessionToken;
  onResponseError;

  /**
   * @type {string|{name: string, version: string | null}}
   */
  requestClient;

  GET;
  POST;
  PUT;
  DELETE;

  constructor() {
    super();
    this.GET = this._makeMethod("GET", { retry: true });
    this.DELETE = this._makeMethod("DELETE", {});
    this.POST = this._makeMethod("POST", { hasBody: true, retry: true });
    this.PUT = this._makeMethod("PUT", { hasBody: true });
  }

  getClientHeaders() {
    const self = this;
    const headers = {};

    if (this.apiKey) {
      headers["X-Api-Key"] = self.apiKey;
    }

    if (this.sessionToken) {
      headers["X-Metabase-Session"] = self.sessionToken;
    }

    if (isWithinIframe() && !self.requestClient) {
      headers["X-Metabase-Embedded"] = "true";
      /**
       * We counted static embed preview query executions which led to wrong embedding stats (EMB-930)
       * This header is only used for analytics and for checking if we want to disable some features in the
       * embedding iframe (only for Documents at the time of this comment)
       */
      if (!IFRAMED_IN_SELF) {
        headers["X-Metabase-Client"] = "embedding-iframe";
      }
    }

    /**
     * We don't want to count modular embedding preview as :simple_embed as that's meant for an actual embed usage.
     */
    if (self.requestClient && !IFRAMED_IN_SELF) {
      if (typeof self.requestClient === "object") {
        headers["X-Metabase-Client"] = self.requestClient.name;
        headers["X-Metabase-Client-Version"] =
          self.requestClient.version ?? "unknown";
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

    return headers;
  }

  _makeMethod(methodTemplate, creatorOptions = {}) {
    return (urlTemplate, methodOptions = {}) => {
      if (typeof methodOptions === "function") {
        methodOptions = { transformResponse: methodOptions };
      }

      const defaultOptions = {
        ...DEFAULT_OPTIONS,
        ...creatorOptions,
        ...methodOptions,
      };

      return async (rawData, invocationOptions = {}) => {
        let { url, method, options } =
          await this.apiRequestManipulationMiddleware({
            url: urlTemplate,
            method: methodTemplate,
            options: { ...defaultOptions, ...invocationOptions },
          });
        // this will transform arrays to objects with numeric keys
        // we shouldn't be using top level-arrays in the API
        const data = { ...rawData };
        for (const tag of url.match(/:\w+/g) || []) {
          const paramName = tag.slice(1);
          let value = data[paramName];
          delete data[paramName];
          if (value === undefined) {
            console.warn("Warning: calling", method, "without", tag);
            value = "";
          }
          if (!options.raw || !options.raw[paramName]) {
            value = encodeURIComponent(value);
          }
          url = url.replace(tag, value);
        }
        // remove undefined
        for (const name in data) {
          if (data[name] === undefined) {
            delete data[name];
          }
        }

        let body;
        if (options.hasBody) {
          body = options.formData
            ? rawData.formData
            : JSON.stringify(
                options.bodyParamName != null
                  ? data[options.bodyParamName]
                  : data,
              );
        } else {
          const qs = querystring.stringify(data);
          if (qs) {
            url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
          }
        }

        const headers = {
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

  async _makeRequestWithRetries(method, url, headers, body, data, options) {
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
      } catch (e) {
        retryCount++;
        // If the response is 503 and the next retry won't put us over the maxAttempts,
        // wait a bit and try again
        if (e.status === 503 && retryCount < maxAttempts) {
          await delay(retryDelays.pop());
        } else {
          throw e;
        }
      }
    } while (retryCount < maxAttempts);
  }

  _makeRequest(...args) {
    const options = args[5];
    // this is temporary to not deal with failed cypress tests
    // we should switch to using fetch in all cases (metabase#28489)
    if (isTest || options.fetch) {
      return this._makeRequestWithFetch(...args);
    } else {
      return this._makeRequestWithXhr(...args);
    }
  }

  _makeRequestWithXhr(method, url, headers, body, data, options) {
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

          let body = xhr.responseText;
          if (options.json) {
            try {
              body = JSON.parse(body);
            } catch (e) {}
          }
          let status = xhr.status;
          if (status === 202 && body && body._status > 0) {
            status = body._status;
          }

          if (status >= 200 && status <= 299) {
            if (options.transformResponse) {
              body = options.transformResponse({ body, data });
            }
            resolve(body);
          } else {
            if (this.onResponseError) {
              this.onResponseError({ body, status, metabaseVersion });
            }

            reject({
              status: status,
              data: body,
              isCancelled: isCancelled,
            });
          }
          if (!options.noEvent) {
            this.emit(status, url);
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
    method,
    url,
    headers,
    requestBody,
    data,
    options,
  ) {
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
        return response.text().then((body) => {
          if (options.json) {
            try {
              body = JSON.parse(body);
            } catch (e) {}
          }

          let status = response.status;
          if (status === 202 && body && body._status > 0) {
            status = body._status;
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
            if (options.transformResponse) {
              body = options.transformResponse({
                body,
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
      .catch((error) => {
        if (signal.aborted) {
          throw { isCancelled: true };
        } else {
          throw error;
        }
      });
  }

  /**
   * @param data {import('metabase/plugins').OnBeforeRequestHandlerData}
   * @return data {Promise<import('metabase/plugins').OnBeforeRequestHandlerData>}
   */
  async apiRequestManipulationMiddleware(data) {
    let { method, url, options } = data;

    /**
     * Handlers order is important.
     * Handlers are executed in order and each handler uses the data returned by a previous handler.
     * @type {import('metabase/plugins').OnBeforeRequestHandler[]}
     */
    const handlers = [];

    if (isEmbeddingSdk()) {
      handlers.push(
        ...[
          PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers
            .getOrRefreshSessionHandler,
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

    if (handlers.length) {
      for (const handler of handlers) {
        const onBeforeRequestHandlerResult = await handler({
          method,
          url,
          options,
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
        }
      }
    }

    return { method, url, options };
  }
}

const instance = new Api();

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default instance;
export const { GET, POST, PUT, DELETE } = instance;

export const setLocaleHeader = (locale) => {
  /* `X-Metabase-Locale` is a header that the BE stores as *user* locale for the scope of the request.
   * We need it to localize downloads. It *currently* only work if there is a user, so it won't work
   * for public/static embedding.
   */
  DEFAULT_OPTIONS.headers["X-Metabase-Locale"] = locale ?? undefined;
};
