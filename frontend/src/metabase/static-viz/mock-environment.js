/* eslint-disable no-prototype-builtins */
import ResizeObserver from "resize-observer-polyfill";

global.ResizeObserver = ResizeObserver;

global.EventTarget = function () {
  this.listeners = {};
};
global.EventTarget.prototype.addEventListener = function () {};
global.EventTarget.prototype.removeEventListener = function () {};
global.EventTarget.prototype.dispatchEvent = function () {};

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
      addEventListener: function () {},
      removeEventListener: function () {},
      innerHTML: "",
    };
  },
  createTextNode: function (text) {
    return { textContent: text };
  },
  getElementById: function () {
    return null;
  },
  getElementsByTagName: function () {
    return [];
  },
  querySelector: function () {
    return null;
  },
  querySelectorAll: function () {
    return [];
  },
  body: {
    appendChild: function () {},
    addEventListener: function () {},
    removeEventListener: function () {},
    style: {},
  },
  head: {
    appendChild: function () {},
    addEventListener: function () {},
    removeEventListener: function () {},
    style: {},
  },
  documentElement: {
    style: {},
  },
  addEventListener: function () {},
  removeEventListener: function () {},
  dispatchEvent: function () {},
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
  getElementById: function () {
    return null;
  },
  getElementsByTagName: function () {
    return [];
  },
  querySelector: function () {
    return null;
  },
  querySelectorAll: function () {
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
  appName: "StaticViz",
  appVersion: "1.0",
  cookieEnabled: false,
  geolocation: {
    getCurrentPosition: function () {},
    watchPosition: function () {},
    clearWatch: function () {},
  },
  onLine: true,
  mediaDevices: {
    getUserMedia: function () {},
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
  replace: function () {},
  assign: function () {},
};

global.history = {
  length: 0,
  state: null,
  back: function () {},
  forward: function () {},
  go: function () {},
  pushState: function () {},
  replaceState: function () {},
};

global.screen = {
  width: 0,
  height: 0,
  availWidth: 0,
  availHeight: 0,
  colorDepth: 24,
  pixelDepth: 24,
};

global.setTimeout = function () {
  return 0;
};
global.clearTimeout = function () {};
global.setInterval = function () {
  return 0;
};
global.clearInterval = function () {};

global.requestAnimationFrame = function () {};
global.cancelAnimationFrame = function () {};

global.Event = function (type) {
  return {
    type: type,
    bubbles: false,
    cancelable: false,
    composed: false,
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

global.CustomEvent = function (type) {
  return new global.Event(type);
};

global.EventTarget = function () {
  this.listeners = {};
};
global.EventTarget.prototype.addEventListener = function () {};
global.EventTarget.prototype.removeEventListener = function () {};
global.EventTarget.prototype.dispatchEvent = function () {};

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
    addListener: function () {},
    removeListener: function () {},
  };
};

global.URL = function (url) {
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

global.MutationObserver = function () {
  return {
    observe: function () {},
    disconnect: function () {},
    takeRecords: function () {
      return [];
    },
  };
};

global.IntersectionObserver = function () {
  return {
    observe: function () {},
    unobserve: function () {},
    disconnect: function () {},
    takeRecords: function () {
      return [];
    },
  };
};

global.FileReader = function () {
  return {
    readAsArrayBuffer: function () {},
    readAsBinaryString: function () {},
    readAsDataURL: function () {},
    readAsText: function () {},
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

global.Blob = function () {
  return {
    size: 0,
    type: "",
    slice: function () {
      return new global.Blob();
    },
  };
};

global.File = function (parts, filename, options) {
  return new global.Blob(parts, options);
};

global.crypto = {
  getRandomValues: function () {},
  subtle: {},
};

global.Headers = function () {
  return {
    append: function () {},
    delete: function () {},
    get: function () {
      return null;
    },
    has: function () {
      return false;
    },
    set: function () {},
    forEach: function () {},
  };
};

global.FormData = function () {
  return {
    append: function () {},
    delete: function () {},
    get: function () {
      return null;
    },
    getAll: function () {
      return [];
    },
    has: function () {
      return false;
    },
    set: function () {},
    forEach: function () {},
  };
};

class TextEncoder {
  encode() {}
}

global.TextEncoder = TextEncoder;

global.document.documentElement.style = {};
global.document.body.style = {};
global.document.head.style = {};
