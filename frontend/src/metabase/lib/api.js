/* @flow weak */

import querystring from "querystring";

import EventEmitter from "events";

import { delay } from "metabase/lib/promise";

type TransformFn = (o: any) => any;

export type Options = {
  noEvent?: boolean,
  retry?: boolean,
  retryCount?: number,
  retryDelayIntervals?: number[],
  transformResponse?: TransformFn,
  cancelled?: Promise<any>,
  raw?: { [key: string]: boolean },
  hasBody?: boolean,
};

const ONE_SECOND = 1000;
const MAX_RETRIES = 10;

export type Data = {
  [key: string]: any,
};

const DEFAULT_OPTIONS: Options = {
  hasBody: false,
  noEvent: false,
  transformResponse: o => o,
  raw: {},
  retry: false,
  retryCount: MAX_RETRIES,
  // Creates an array with exponential backoff in millis
  // i.e. [1000, 2000, 4000, 8000...]
  retryDelayIntervals: Array.from(new Array(MAX_RETRIES).keys())
    .map(x => ONE_SECOND * Math.pow(2, x))
    .reverse(),
};

export type APIMethod = (d?: Data, o?: Options) => Promise<any>;
export type APICreator = (t: string, o?: Options | TransformFn) => APIMethod;

class Api extends EventEmitter {
  basename: "";

  GET: APICreator;
  POST: APICreator;
  PUT: APICreator;
  DELETE: APICreator;

  constructor() {
    super();
    this.GET = this._makeMethod("GET", { retry: true });
    this.DELETE = this._makeMethod("DELETE", {});
    this.POST = this._makeMethod("POST", { hasBody: true, retry: true });
    this.PUT = this._makeMethod("PUT", { hasBody: true });
  }

  _makeMethod(method: string, creatorOptions?: Options = {}): APICreator {
    return (
      urlTemplate: string,
      methodOptions?: Options | TransformFn = {},
    ) => {
      if (typeof methodOptions === "function") {
        methodOptions = { transformResponse: methodOptions };
      }

      const defaultOptions = {
        ...DEFAULT_OPTIONS,
        ...creatorOptions,
        ...methodOptions,
      };

      return async (
        data?: Data,
        invocationOptions?: Options = {},
      ): Promise<any> => {
        const options: Options = { ...defaultOptions, ...invocationOptions };
        let url = urlTemplate;
        data = { ...data };
        for (let tag of url.match(/:\w+/g) || []) {
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

        let headers: { [key: string]: string } = {
          Accept: "application/json",
        };

        let body;
        if (options.hasBody) {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(data);
        } else {
          let qs = querystring.stringify(data);
          if (qs) {
            url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
          }
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
    // Get a copy of the delay intervals that we can remove items from as we retry
    let retryDelays = options.retryDelayIntervals.slice();
    let retryCount: number = 0;
    // maxAttempts is the first attempt followed by the number of retries
    let maxAttempts: number = options.retryCount + 1;
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
      // $FlowFixMe: fails with our old version of flow but not newer versions
    } while (retryCount < maxAttempts);
  }

  // TODO Atte Keinänen 6/26/17: Replacing this with isomorphic-fetch could simplify the implementation
  _makeRequest(method, url, headers, body, data, options) {
    return new Promise((resolve, reject) => {
      let isCancelled = false;
      let xhr = new XMLHttpRequest();
      xhr.open(method, this.basename + url);
      for (let headerName in headers) {
        xhr.setRequestHeader(headerName, headers[headerName]);
      }
      xhr.onreadystatechange = () => {
        // $FlowFixMe
        if (xhr.readyState === XMLHttpRequest.DONE) {
          let body = xhr.responseText;
          try {
            body = JSON.parse(body);
          } catch (e) {}
          if (xhr.status >= 200 && xhr.status <= 299) {
            if (options.transformResponse) {
              body = options.transformResponse(body, { data });
            }
            resolve(body);
          } else {
            reject({
              status: xhr.status,
              data: body,
              isCancelled: isCancelled,
            });
          }
          if (!options.noEvent) {
            this.emit(xhr.status, url);
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
}

const instance = new Api();

export default instance;
export const { GET, POST, PUT, DELETE } = instance;
