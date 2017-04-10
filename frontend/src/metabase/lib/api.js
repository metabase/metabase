/* @flow */

import querystring from "querystring";

import EventEmitter from "events";

type ParamsMap = { [key:string]: any };
type TransformFn = (o: any) => any;

class Api extends EventEmitter {
    basename: "";

    constructor(...args) {
        super(...args);

        this.GET = this._makeMethod("GET").bind(this);
        this.DELETE = this._makeMethod("DELETE").bind(this);
        this.POST = this._makeMethod("POST", true).bind(this);
        this.PUT = this._makeMethod("PUT", true).bind(this);
    }

    _makeMethod(method: string, hasBody: boolean = false) {
        return (
            urlTemplate: string,
            params: ParamsMap|TransformFn = {},
            transformResponse: TransformFn = (o) => o
        ) => {
            if (typeof params === "function") {
                transformResponse = params;
                params = {};
            }
            return (
                data?: { [key:string]: any },
                options?: { [key:string]: any } = {}
            ): Promise<any> => {
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
                                resolve(transformResponse(body, { data }));
                            } else {
                                reject({
                                    status: xhr.status,
                                    data: body
                                });
                            }
                            this.emit(xhr.status, url);
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
