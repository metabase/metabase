import EventEmitter from "events";
import querystring from "querystring";

import { isTest } from "metabase/env";
import { isWithinIframe } from "metabase/lib/dom";
import { delay } from "metabase/lib/promise";

const ONE_SECOND = 1000;
const MAX_RETRIES = 10;

// eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
const ANTI_CSRF_HEADER = "X-Metabase-Anti-CSRF-Token";

let ANTI_CSRF_TOKEN: string | null = null;

type RequestOptions = {
  json: boolean;
  hasBody: boolean;
  noEvent: boolean;
  transformResponse: (response: any, options: any) => any;
  raw: any;
  headers: Record<string, string>;
  retry: boolean;
  retryCount: number;
  retryDelayIntervals: number[];
  bodyParamName?: string;
  formData?: boolean;
  cancelled?: Promise<unknown>;
};

type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";

const DEFAULT_OPTIONS: RequestOptions = {
  json: true,
  hasBody: false,
  noEvent: false,
  transformResponse: o => o,
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

// @ts-expect-error not sure why TS is sad about this
export class Api extends EventEmitter {
  basename = "";

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

  _makeMethod(
    method: RequestMethod,
    creatorOptions: Partial<RequestOptions> = {},
  ) {
    return (urlTemplate: string, methodOptions = {}) => {
      if (typeof methodOptions === "function") {
        methodOptions = { transformResponse: methodOptions };
      }

      const defaultOptions: RequestOptions = {
        ...DEFAULT_OPTIONS,
        ...creatorOptions,
        ...methodOptions,
      };

      return async (
        rawData?: any,
        invocationOptions: Partial<RequestOptions> = {},
      ) => {
        const options: RequestOptions = {
          ...defaultOptions,
          ...invocationOptions,
        };
        let url = urlTemplate;
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

        const headers: RequestOptions["headers"] = options.json
          ? { Accept: "application/json", "Content-Type": "application/json" }
          : {};

        if (options.formData) {
          delete headers["Content-Type"];
        }

        if (isWithinIframe()) {
          // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
          headers["X-Metabase-Embedded"] = "true";
        }

        if (ANTI_CSRF_TOKEN) {
          headers[ANTI_CSRF_HEADER] = ANTI_CSRF_TOKEN;
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

        Object.assign(headers, options.headers);

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
    method: RequestMethod,
    url: string,
    headers: RequestOptions["headers"],
    body: any,
    data: any,
    options: RequestOptions,
  ) {
    // Get a copy of the delay intervals that we can remove items from as we retry
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
      } catch (e: any) {
        retryCount++;
        // If the response is 503 and the next retry won't put us over the maxAttempts,
        // wait a bit and try again
        if (e.status === 503 && retryCount < maxAttempts) {
          await delay(retryDelays.pop() ?? 100);
        } else {
          throw e;
        }
      }
    } while (retryCount < maxAttempts);
  }

  _makeRequest(
    method: RequestMethod,
    url: string,
    headers: RequestOptions["headers"],
    requestBody: any,
    data: any,
    options: RequestOptions,
  ) {
    return this._makeRequestWithFetch(
      method,
      url,
      headers,
      requestBody,
      data,
      options,
    );
  }

  async _makeRequestWithFetch(
    method: RequestMethod,
    url: string,
    headers: RequestOptions["headers"],
    requestBody: any,
    data: any,
    options: RequestOptions,
  ) {
    const controller = options.controller || new AbortController();
    options.cancelled?.then(() => controller.abort());

    const requestUrl = new URL(this.basename + url, location.origin);
    const request = new Request(requestUrl.href, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    return fetch(request)
      .then(response => {
        return response.text().then((body: any) => {
          if (options.json) {
            try {
              body = JSON.parse(body);
            } catch (e) {}
          }

          let status = response.status;
          if (status === 202 && body?._status > 0) {
            status = body._status;
          }

          const token = response.headers.get(ANTI_CSRF_HEADER);
          if (token) {
            ANTI_CSRF_TOKEN = token;
          }

          if (!options.noEvent) {
            // @ts-expect-error related to constructor error above
            this.emit(status, url);
          }

          if (status >= 200 && status <= 299) {
            if (options.transformResponse) {
              body = options.transformResponse(body, { data });
            }
            return body;
          } else {
            throw { status: status, data: body };
          }
        });
      })
      .catch(error => {
        if (controller.signal.aborted) {
          throw { isCancelled: true };
        } else {
          throw error;
        }
      }) as any;
  }
}

const instance = new Api();

// eslint-disable-next-line import/no-default-export
export default instance;
export const { GET, POST, PUT, DELETE } = instance;
