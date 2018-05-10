/* @flow weak */

import "isomorphic-fetch";

import querystring from "querystring";

import EventEmitter from "events";

type TransformFn = (o: any) => any;

export type Options = {
  noEvent?: boolean,
  transformResponse?: TransformFn,
  cancelled?: Promise<any>,
  raw?: { [key: string]: boolean },
};
export type Data = {
  [key: string]: any,
};

const DEFAULT_OPTIONS: Options = {
  noEvent: false,
  transformResponse: o => o,
  raw: {},
};

export type APIMethod = (d?: Data, o?: Options) => Promise<any>;
export type APICreator = (t: string, o?: Options | TransformFn) => APIMethod;

export class Api extends EventEmitter {
  basename: "";
  headers: null;

  GET: APICreator;
  POST: APICreator;
  PUT: APICreator;
  DELETE: APICreator;

  constructor() {
    super();
    this.GET = this._makeMethod("GET");
    this.DELETE = this._makeMethod("DELETE");
    this.POST = this._makeMethod("POST", true);
    this.PUT = this._makeMethod("PUT", true);
  }

  _makeMethod(method: string, hasBody: boolean = false): APICreator {
    return (
      urlTemplate: string,
      methodOptions?: Options | TransformFn = {},
    ) => {
      if (typeof methodOptions === "function") {
        methodOptions = { transformResponse: methodOptions };
      }
      const defaultOptions = { ...DEFAULT_OPTIONS, ...methodOptions };
      return (data?: Data, invocationOptions?: Options = {}): Promise<any> => {
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

        let headers: { [key: string]: string } = {
          Accept: "application/json",
        };

        let body;
        if (hasBody) {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(data);
        } else {
          let qs = querystring.stringify(data);
          if (qs) {
            url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
          }
        }

        return this._makeRequest(method, url, headers, body, data, options);
      };
    };
  }

  async _makeRequest(method, url, headers, body, data, options) {
    let isCancelled = false;
    let result;
    try {
      if (this.headers) {
        headers = { ...this.headers, ...(headers || {}) };
      }
      const fetchOptions = {
        method,
        headers: new Headers(headers),
        credentials: "include",
      };
      if (body) {
        fetchOptions.body = body;
      }
      if (options.cancelled) {
        // eslint-disable-next-line no-undef
        var controller = new AbortController();
        fetchOptions.signal = controller.signal;
        options.cancelled.then(() => {
          isCancelled = true;
          controller.abort();
        });
      }

      result = await fetch(this.basename + url, fetchOptions);

      let resultBody = null;
      try {
        resultBody = await result.text();
        // Even if the result conversion to JSON fails, we still return the original textsou
        resultBody = JSON.parse(resultBody);
      } catch (e) {}

      if (result.status >= 200 && result.status <= 299) {
        if (options.transformResponse) {
          return options.transformResponse(resultBody, { data });
        } else {
          return resultBody;
        }
      } else {
        throw {
          status: result.status,
          data: resultBody,
          isCancelled,
        };
      }
    } finally {
      if (!options.noEvent) {
        this.emit(result && result.status, url);
      }
    }
  }
}

const instance = new Api();

export default instance;
export const { GET, POST, PUT, DELETE } = instance;
