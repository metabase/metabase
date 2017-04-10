/* @flow */

import querystring from "querystring";

import EventEmitter from "events";

type TransformFn = (o: any) => any;

type Options = {
    noEvent?: boolean,
    transformResponse?: TransformFn,
    cancelled?: Promise<any>
}
type Data = {
    [key:string]: any
};

const DEFAULT_OPTIONS: Options = {
    noEvent: false,
    transformResponse: (o) => o
}

class Api extends EventEmitter {
    basename: "";

    GET:    (t: string, o?: Options|TransformFn) => (d?: Data, o?: Options) => Promise<any>;
    POST:   (t: string, o?: Options|TransformFn) => (d?: Data, o?: Options) => Promise<any>;
    PUT:    (t: string, o?: Options|TransformFn) => (d?: Data, o?: Options) => Promise<any>;
    DELETE: (t: string, o?: Options|TransformFn) => (d?: Data, o?: Options) => Promise<any>;

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
            methodOptions?: Options|TransformFn = {}
        ) => {
            if (typeof options === "function") {
                methodOptions = { transformResponse: methodOptions };
            }
            return (
                data?: Data,
                invocationOptions?: Options = {}
            ): Promise<any> => {
                const options = { ...DEFAULT_OPTIONS, ...methodOptions, ...invocationOptions };
                let url = urlTemplate;
                data = { ...data };
                for (let tag of (url.match(/:\w+/g) || [])) {
                    let value = data[tag.slice(1)];
                    if (value === undefined) {
                        console.warn("Warning: calling", method, "without", tag);
                        value = "";
                    }
                    url = url.replace(tag, encodeURIComponent(data[tag.slice(1)]))
                    delete data[tag.slice(1)];
                }

                let headers: { [key:string]: string } = {
                    "Accept": "application/json",
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

                return new Promise((resolve, reject) => {
                    let xhr = new XMLHttpRequest();
                    xhr.open(method, this.basename + url);
                    for (let headerName in headers) {
                        xhr.setRequestHeader(headerName, headers[headerName])
                    }
                    xhr.onreadystatechange = () => {
                        // $FlowFixMe
                        if (xhr.readyState === XMLHttpRequest.DONE) {
                            let body = xhr.responseText;
                            try { body = JSON.parse(body); } catch (e) {}
                            if (xhr.status >= 200 && xhr.status <= 299) {
                                resolve(options.transformResponse(body, { data }));
                            } else {
                                reject({
                                    status: xhr.status,
                                    data: body
                                });
                            }
                            if (!options.noEvent) {
                                this.emit(xhr.status, url);
                            }
                        }
                    }
                    xhr.send(body);

                    if (options.cancelled) {
                        options.cancelled.then(() => xhr.abort());
                    }
                });
            }
        }
    }
}

export default new Api();
