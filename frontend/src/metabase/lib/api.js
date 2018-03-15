/* @flow weak */

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

class Api extends EventEmitter {
  basename: "";

  GET: (
    t: string,
    o?: Options | TransformFn,
  ) => (d?: Data, o?: Options) => Promise<any>;
  POST: (
    t: string,
    o?: Options | TransformFn,
  ) => (d?: Data, o?: Options) => Promise<any>;
  PUT: (
    t: string,
    o?: Options | TransformFn,
  ) => (d?: Data, o?: Options) => Promise<any>;
  DELETE: (
    t: string,
    o?: Options | TransformFn,
  ) => (d?: Data, o?: Options) => Promise<any>;

  constructor() {
    super();
    this.GET = this._makeMethod("GET").bind(this);
    this.DELETE = this._makeMethod("DELETE").bind(this);
    this.POST = this._makeMethod("POST", true).bind(this);
    this.PUT = this._makeMethod("PUT", true).bind(this);
  }

  _makeMethod(method: string, hasBody: boolean = false) {
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

export default new Api();
