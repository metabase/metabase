/* eslint-disable no-prototype-builtins */
import ResizeObserver from "resize-observer-polyfill";

global.ResizeObserver = ResizeObserver;

global.EventTarget = function () {
  this.listeners = {};
};
global.EventTarget.prototype.addEventListener = function (type, callback) {
  if (!this.listeners[type]) {
    this.listeners[type] = [];
  }
  this.listeners[type].push(callback);
};
global.EventTarget.prototype.removeEventListener = function (type, callback) {
  if (!this.listeners[type]) {
    return;
  }
  const index = this.listeners[type].indexOf(callback);
  if (index > -1) {
    this.listeners[type].splice(index, 1);
  }
};
global.EventTarget.prototype.dispatchEvent = function (event) {
  if (!this.listeners[event.type]) {
    return true;
  }
  for (const callback of this.listeners[event.type]) {
    callback.call(this, event);
  }
  return !event.defaultPrevented;
};

global.window = new global.EventTarget();

Object.assign(global.window, global);

global.document = new global.EventTarget();
Object.assign(global.document, {
  createElement: function (tagName) {
    return {
      tagName: tagName.toUpperCase(),
      style: {},
      children: [],
      appendChild: function (child) {
        this.children.push(child);
      },
      setAttribute: function (name, value) {
        this[name] = value;
      },
      getAttribute: function (name) {
        return this[name];
      },
      addEventListener: function (type, listener, options) {},
      removeEventListener: function (type, listener, options) {},
      innerHTML: "",
    };
  },
  createTextNode: function (text) {
    return { textContent: text };
  },
  getElementById: function (id) {
    return null;
  },
  getElementsByTagName: function (tagName) {
    return [];
  },
  querySelector: function (selector) {
    return null;
  },
  querySelectorAll: function (selector) {
    return [];
  },
  body: {
    appendChild: function (child) {},
    addEventListener: function (type, listener, options) {},
    removeEventListener: function (type, listener, options) {},
    style: {},
  },
  head: {
    appendChild: function (child) {},
    addEventListener: function (type, listener, options) {},
    removeEventListener: function (type, listener, options) {},
    style: {},
  },
  documentElement: {
    style: {},
  },
  addEventListener: function (type, listener, options) {},
  removeEventListener: function (type, listener, options) {},
  dispatchEvent: function (event) {},
  readyState: "complete",
  cookie: "",
});
global.window.document = global.document;

global.Element = function (tagName) {
  EventTarget.call(this);
  this.tagName = tagName.toUpperCase();
  this.children = [];
  this.style = {};
  this.attributes = {};
};
Object.setPrototypeOf(global.Element.prototype, global.EventTarget.prototype);
global.Element.prototype.appendChild = function (child) {
  this.children.push(child);
  return child;
};
global.Element.prototype.setAttribute = function (name, value) {
  this.attributes[name] = value;
};
global.Element.prototype.getAttribute = function (name) {
  return this.attributes[name];
};
Object.setPrototypeOf(global.Element.prototype, global.EventTarget.prototype);
global.Element.prototype.appendChild = function (child) {
  this.children.push(child);
};

if (typeof globalThis === "undefined") {
  global.globalThis = global.window;
}

global.document = new EventTarget();
Object.assign(global.document, {
  createElement: function (tagName) {
    return new global.Element(tagName);
  },
  createTextNode: function (text) {
    return { textContent: text };
  },
  getElementById: function (id) {
    return null;
  },
  getElementsByTagName: function (tagName) {
    return [];
  },
  querySelector: function (selector) {
    return null;
  },
  querySelectorAll: function (selector) {
    return [];
  },
  documentElement: new global.Element("html"),
  head: new global.Element("head"),
  body: new global.Element("body"),
  readyState: "complete",
  cookie: "",
});

global.navigator = {
  userAgent: "GraalJS",
  language: "en-US",
  languages: ["en-US", "en"],
  platform: "GraalJS",
  appName: "Netscape",
  appVersion: "5.0 (GraalJS)",
  cookieEnabled: false,
  geolocation: {
    getCurrentPosition: function (success, error, options) {
      if (typeof error === "function") {
        error({ code: 1, message: "Geolocation not available" });
      }
    },
    watchPosition: function (success, error, options) {
      return 0;
    },
    clearWatch: function (id) {},
  },
  onLine: true,
  mediaDevices: {
    getUserMedia: function (constraints) {
      return Promise.reject(new Error("getUserMedia is not implemented"));
    },
  },
};

const navigator = {
  userAgent: "GraalJS",
  platform: "GraalJS",
  language: "en-US",
  languages: ["en-US", "en"],
};

global.navigator = navigator;
global.window.navigator = navigator;

global.location = {
  href: "",
  protocol: "",
  host: "",
  hostname: "",
  port: "",
  pathname: "",
  search: "",
  hash: "",
  origin: "",
  reload: function () {},
  replace: function (url) {},
  assign: function (url) {},
};

global.history = {
  length: 0,
  state: null,
  back: function () {},
  forward: function () {},
  go: function (delta) {},
  pushState: function (state, title, url) {},
  replaceState: function (state, title, url) {},
};

global.screen = {
  width: 0,
  height: 0,
  availWidth: 0,
  availHeight: 0,
  colorDepth: 24,
  pixelDepth: 24,
};

global.setTimeout = function (callback, delay) {
  return 0;
};
global.clearTimeout = function (id) {};
global.setInterval = function (callback, delay) {
  return 0;
};
global.clearInterval = function (id) {};

global.requestAnimationFrame = function (callback) {};
global.cancelAnimationFrame = function (id) {};

global.Event = function (type, eventInitDict) {
  return {
    type: type,
    bubbles: (eventInitDict && eventInitDict.bubbles) || false,
    cancelable: (eventInitDict && eventInitDict.cancelable) || false,
    composed: (eventInitDict && eventInitDict.composed) || false,
    target: null,
    currentTarget: null,
    eventPhase: 0,
    stopPropagation: function () {},
    stopImmediatePropagation: function () {},
    preventDefault: function () {},
    isTrusted: false,
    timeStamp: Date.now(),
  };
};

global.CustomEvent = function (type, eventInitDict) {
  const event = new global.Event(type, eventInitDict);
  event.detail = (eventInitDict && eventInitDict.detail) || null;
  return event;
};

global.EventTarget = function () {
  this.listeners = {};
};
global.EventTarget.prototype.addEventListener = function (type, callback) {
  if (!this.listeners[type]) {
    this.listeners[type] = [];
  }
  this.listeners[type].push(callback);
};
global.EventTarget.prototype.removeEventListener = function (type, callback) {
  if (!this.listeners[type]) {
    return;
  }
  const index = this.listeners[type].indexOf(callback);
  if (index > -1) {
    this.listeners[type].splice(index, 1);
  }
};
global.EventTarget.prototype.dispatchEvent = function (event) {
  if (!this.listeners[event.type]) {
    return true;
  }
  for (const callback of this.listeners[event.type]) {
    callback.call(this, event);
  }
  return !event.defaultPrevented;
};

global.localStorage = {
  _data: {},
  setItem: function (key, value) {
    this._data[key] = String(value);
  },
  getItem: function (key) {
    return this._data.hasOwnProperty(key) ? this._data[key] : null;
  },
  removeItem: function (key) {
    delete this._data[key];
  },
  clear: function () {
    this._data = {};
  },
  key: function (index) {
    return Object.keys(this._data)[index] || null;
  },
  get length() {
    return Object.keys(this._data).length;
  },
};

global.sessionStorage = {
  _data: {},
  setItem: function (key, value) {
    this._data[key] = String(value);
  },
  getItem: function (key) {
    return this._data.hasOwnProperty(key) ? this._data[key] : null;
  },
  removeItem: function (key) {
    delete this._data[key];
  },
  clear: function () {
    this._data = {};
  },
  key: function (index) {
    return Object.keys(this._data)[index] || null;
  },
  get length() {
    return Object.keys(this._data).length;
  },
};

global.fetch = function (url, options) {
  return Promise.reject(
    new Error("Fetch API is not available in this environment."),
  );
};

global.WebSocket = function (url, protocols) {
  throw new Error("WebSocket is not available in this environment.");
};

global.XMLHttpRequest = function () {
  return {
    open: function (method, url, async, user, password) {},
    send: function (data) {},
    setRequestHeader: function (header, value) {},
    getResponseHeader: function (header) {
      return null;
    },
    getAllResponseHeaders: function () {
      return "";
    },
    overrideMimeType: function (mime) {},
    readyState: 4,
    status: 200,
    responseText: "",
    responseXML: null,
    onreadystatechange: function () {},
  };
};

Object.defineProperty(global.document, "cookie", {
  get: function () {
    return this._cookie || "";
  },
  set: function (value) {
    this._cookie = value;
  },
});

global.matchMedia = function (query) {
  return {
    matches: false,
    media: query,
    addListener: function (listener) {},
    removeListener: function (listener) {},
  };
};

global.URL = function (url, base) {
  return {
    href: url,
    origin: "",
    protocol: "",
    username: "",
    password: "",
    host: "",
    hostname: "",
    port: "",
    pathname: "",
    search: "",
    searchParams: {},
    hash: "",
    toString: function () {
      return url;
    },
  };
};

global.MutationObserver = function (callback) {
  return {
    observe: function (target, options) {},
    disconnect: function () {},
    takeRecords: function () {
      return [];
    },
  };
};

global.IntersectionObserver = function (callback, options) {
  return {
    observe: function (target) {},
    unobserve: function (target) {},
    disconnect: function () {},
    takeRecords: function () {
      return [];
    },
  };
};

global.FileReader = function () {
  return {
    readAsArrayBuffer: function (blob) {},
    readAsBinaryString: function (blob) {},
    readAsDataURL: function (blob) {},
    readAsText: function (blob, encoding) {},
    abort: function () {},
    result: null,
    error: null,
    onloadstart: null,
    onprogress: null,
    onload: null,
    onabort: null,
    onerror: null,
    onloadend: null,
    readyState: 0,
  };
};

global.Blob = function (parts, options) {
  return {
    size: 0,
    type: (options && options.type) || "",
    slice: function (start, end, contentType) {
      return new global.Blob();
    },
  };
};

global.File = function (parts, filename, options) {
  const blob = new global.Blob(parts, options);
  blob.name = filename;
  blob.lastModified = (options && options.lastModified) || Date.now();
  return blob;
};

global.crypto = {
  getRandomValues: function (typedArray) {
    for (let i = 0; i < typedArray.length; i++) {
      typedArray[i] = Math.floor(Math.random() * 256);
    }
    return typedArray;
  },
  subtle: {},
};

global.Headers = function (init) {
  return {
    append: function (name, value) {},
    delete: function (name) {},
    get: function (name) {
      return null;
    },
    has: function (name) {
      return false;
    },
    set: function (name, value) {},
    forEach: function (callback, thisArg) {},
  };
};

global.FormData = function (form) {
  return {
    append: function (name, value, filename) {},
    delete: function (name) {},
    get: function (name) {
      return null;
    },
    getAll: function (name) {
      return [];
    },
    has: function (name) {
      return false;
    },
    set: function (name, value, filename) {},
    forEach: function (callback, thisArg) {},
  };
};

class TextEncoder {
  encode(str) {
    const utf8 = [];
    for (let i = 0; i < str.length; i++) {
      let charcode = str.charCodeAt(i);
      if (charcode < 0x80) {
        utf8.push(charcode);
      } else if (charcode < 0x800) {
        utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
      } else if (charcode < 0xd800 || charcode >= 0xe000) {
        utf8.push(
          0xe0 | (charcode >> 12),
          0x80 | ((charcode >> 6) & 0x3f),
          0x80 | (charcode & 0x3f),
        );
      } else {
        i++;
        charcode =
          0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        utf8.push(
          0xf0 | (charcode >> 18),
          0x80 | ((charcode >> 12) & 0x3f),
          0x80 | ((charcode >> 6) & 0x3f),
          0x80 | (charcode & 0x3f),
        );
      }
    }
    return new Uint8Array(utf8);
  }
}

global.TextEncoder = TextEncoder;

global.document.documentElement.style = {};
global.document.body.style = {};
global.document.head.style = {};
