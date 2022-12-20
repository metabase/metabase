import EventEmitter from "events";
import querystring from "querystring";

import { delay } from "metabase/lib/promise";
import { IFRAMED } from "metabase/lib/dom";

const ONE_SECOND = 1000;
const MAX_RETRIES = 10;

const ANTI_CSRF_HEADER = "X-Metabase-Anti-CSRF-Token";

let ANTI_CSRF_TOKEN = null;

const DEFAULT_OPTIONS = {
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
  retryDelayIntervals: Array.from(new Array(MAX_RETRIES).keys())
    .map(x => ONE_SECOND * Math.pow(2, x))
    .reverse(),
};

export class Api extends EventEmitter {
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

  _makeMethod(method, creatorOptions = {}) {
    return (urlTemplate, methodOptions = {}) => {
      if (typeof methodOptions === "function") {
        methodOptions = { transformResponse: methodOptions };
      }

      const defaultOptions = {
        ...DEFAULT_OPTIONS,
        ...creatorOptions,
        ...methodOptions,
      };

      return async (data, invocationOptions = {}) => {
        const options = { ...defaultOptions, ...invocationOptions };
        let url = urlTemplate;
        data = { ...data };
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

        const headers = options.json
          ? { Accept: "application/json", "Content-Type": "application/json" }
          : {};

        if (IFRAMED) {
          headers["X-Metabase-Embedded"] = "true";
        }

        if (ANTI_CSRF_TOKEN) {
          headers[ANTI_CSRF_HEADER] = ANTI_CSRF_TOKEN;
        }

        let body;
        if (options.hasBody) {
          body = JSON.stringify(
            options.bodyParamName != null ? data[options.bodyParamName] : data,
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

  async _makeRequestWithRetries(method, url, headers, body, data, options) {
    // Get a copy of the delay intervals that we can remove items from as we retry
    const retryDelays = options.retryDelayIntervals.slice();
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

  async _makeRequest(method, url, headers, requestBody, data, options) {
    const controller = new AbortController();
    options.cancelled?.then(() => controller.abort());

    const uri = new URL(url, window.location.origin);
    const request = new Request(uri.href, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    let response;

    try {
      response = await fetch(request);
    } catch (error) {
      if (controller.signal.aborted) {
        throw { isCancelled: true };
      } else {
        throw error;
      }
    }

    let body;
    try {
      body = options.json ? await response.json() : await response.text();
    } catch (e) {}

    let status = response.status;
    if (status === 202 && body && body._status > 0) {
      status = body._status;
    }

    const token = response.headers.get(ANTI_CSRF_HEADER);
    if (token) {
      ANTI_CSRF_TOKEN = token;
    }

    if (!options.noEvent) {
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
  }
}

const instance = new Api();

export default instance;
export const { GET, POST, PUT, DELETE } = instance;
