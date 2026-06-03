/*
 * Headless validation harness for Metabot-generated custom visualizations.
 *
 * Loaded into a sandboxed GraalJS context (no host access, no DOM) BEFORE the
 * generated plugin bundle. It installs a permissive DOM/browser shim and the
 * `__METABASE_VIZ_API__` helpers the real sandbox exposes, then `__validate__()`
 * drives the plugin through the same lifecycle the frontend does
 * (factory -> checkRenderable -> mount -> update -> unmount) and returns a JSON
 * string describing the outcome.
 *
 * The shim is intentionally permissive: unknown DOM members resolve to no-op
 * stubs rather than throwing, so the harness flags genuine plugin bugs
 * (SyntaxError, ReferenceError, TypeError, explicit throws, a missing `mount`)
 * without rejecting otherwise-valid plugins that touch a DOM API we didn't model.
 */
(function () {
  "use strict";

  var NOOP = function () {};

  function errString(e) {
    try {
      if (e == null) {
        return "Unknown error";
      }
      if (e.name && e.message) {
        return String(e.name) + ": " + String(e.message);
      }
      return String(e.message || e);
    } catch (_) {
      return "Unknown error";
    }
  }

  // ----------------------------------------------------------------- DOM shim

  function makeStyle() {
    var store = {};
    return new Proxy(store, {
      get: function (t, p) {
        if (p === "setProperty") {
          return function (k, v) { t[k] = v; };
        }
        if (p === "removeProperty") {
          return function (k) { delete t[k]; };
        }
        if (p === "getPropertyValue") {
          return function (k) { return t[k] == null ? "" : t[k]; };
        }
        if (p === "cssText") { return t.cssText || ""; }
        var v = t[p];
        return v == null ? "" : v;
      },
      set: function (t, p, v) { t[p] = v; return true; },
    });
  }

  function makeClassList() {
    var set = {};
    return {
      add: function () { for (var i = 0; i < arguments.length; i++) { set[arguments[i]] = true; } },
      remove: function () { for (var i = 0; i < arguments.length; i++) { delete set[arguments[i]]; } },
      toggle: function (c) { set[c] = !set[c]; return set[c]; },
      contains: function (c) { return !!set[c]; },
      replace: NOOP,
    };
  }

  function makeCanvasContext() {
    var base = {
      canvas: null,
      measureText: function (t) { return { width: String(t == null ? "" : t).length * 7 }; },
      getImageData: function () { return { data: [], width: 0, height: 0 }; },
      createLinearGradient: function () { return { addColorStop: NOOP }; },
      createRadialGradient: function () { return { addColorStop: NOOP }; },
      createPattern: function () { return null; },
      setTransform: NOOP,
      getContextAttributes: function () { return {}; },
    };
    // Any other 2d/webgl method -> no-op; any other property -> 0.
    return new Proxy(base, {
      get: function (t, p) {
        if (p in t) { return t[p]; }
        return NOOP;
      },
      set: function (t, p, v) { t[p] = v; return true; },
    });
  }

  function makeElement(tag, ns) {
    var children = [];
    var attributes = {};
    var listeners = {};
    var base = {
      nodeType: 1,
      tagName: String(tag || "div").toUpperCase(),
      localName: String(tag || "div").toLowerCase(),
      namespaceURI: ns || null,
      ownerDocument: null,
      parentNode: null,
      parentElement: null,
      style: makeStyle(),
      classList: makeClassList(),
      dataset: {},
      attributes: attributes,
      childNodes: children,
      children: children,
      __text: "",
      __w: 0,
      __h: 0,

      appendChild: function (c) { children.push(c); if (c) { c.parentNode = base; c.parentElement = base; } return c; },
      append: function () { for (var i = 0; i < arguments.length; i++) { children.push(arguments[i]); } },
      prepend: function () { for (var i = 0; i < arguments.length; i++) { children.unshift(arguments[i]); } },
      insertBefore: function (c) { children.push(c); if (c) { c.parentNode = base; } return c; },
      removeChild: function (c) { var i = children.indexOf(c); if (i >= 0) { children.splice(i, 1); } return c; },
      remove: function () { var p = base.parentNode; if (p && p.childNodes) { var i = p.childNodes.indexOf(base); if (i >= 0) { p.childNodes.splice(i, 1); } } },
      replaceChild: function (n, o) { var i = children.indexOf(o); if (i >= 0) { children[i] = n; } return o; },
      replaceChildren: function () { children.length = 0; for (var i = 0; i < arguments.length; i++) { children.push(arguments[i]); } },
      cloneNode: function () { return makeElement(tag, ns); },

      setAttribute: function (k, v) { attributes[k] = String(v); },
      setAttributeNS: function (_ns, k, v) { attributes[k] = String(v); },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attributes, k) ? attributes[k] : null; },
      getAttributeNS: function (_ns, k) { return Object.prototype.hasOwnProperty.call(attributes, k) ? attributes[k] : null; },
      removeAttribute: function (k) { delete attributes[k]; },
      removeAttributeNS: function (_ns, k) { delete attributes[k]; },
      hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attributes, k); },
      toggleAttribute: function (k) { if (attributes[k] == null) { attributes[k] = ""; return true; } delete attributes[k]; return false; },

      addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
      removeEventListener: NOOP,
      dispatchEvent: function () { return true; },

      getBoundingClientRect: function () {
        return { x: 0, y: 0, top: 0, left: 0, right: base.__w, bottom: base.__h, width: base.__w, height: base.__h };
      },
      getClientRects: function () { return []; },
      getContext: function () { return makeCanvasContext(); },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getElementsByTagName: function () { return []; },
      getElementsByClassName: function () { return []; },
      closest: function () { return null; },
      matches: function () { return false; },
      contains: function () { return false; },
      focus: NOOP, blur: NOOP, click: NOOP, scrollIntoView: NOOP, scrollTo: NOOP,
      setPointerCapture: NOOP, releasePointerCapture: NOOP, hasPointerCapture: function () { return false; },
      insertAdjacentHTML: NOOP, insertAdjacentElement: NOOP, normalize: NOOP,
    };

    var props = {
      innerHTML: { get: function () { return ""; }, set: function () { children.length = 0; } },
      outerHTML: { get: function () { return ""; }, set: NOOP },
      textContent: { get: function () { return base.__text; }, set: function (v) { base.__text = v == null ? "" : String(v); children.length = 0; } },
      innerText: { get: function () { return base.__text; }, set: function (v) { base.__text = v == null ? "" : String(v); } },
      value: { get: function () { return base.__value == null ? "" : base.__value; }, set: function (v) { base.__value = v; } },
      offsetWidth: { get: function () { return base.__w; } },
      offsetHeight: { get: function () { return base.__h; } },
      clientWidth: { get: function () { return base.__w; } },
      clientHeight: { get: function () { return base.__h; } },
      scrollWidth: { get: function () { return base.__w; } },
      scrollHeight: { get: function () { return base.__h; } },
      offsetTop: { get: function () { return 0; } },
      offsetLeft: { get: function () { return 0; } },
      offsetParent: { get: function () { return null; } },
      firstChild: { get: function () { return children[0] || null; } },
      firstElementChild: { get: function () { return children[0] || null; } },
      lastChild: { get: function () { return children[children.length - 1] || null; } },
      lastElementChild: { get: function () { return children[children.length - 1] || null; } },
      nextSibling: { get: function () { return null; } },
      previousSibling: { get: function () { return null; } },
      childElementCount: { get: function () { return children.length; } },
    };
    Object.defineProperties(base, props);

    // Permissive wrapper: known members resolve normally; unknown reads return a
    // no-op (callable + harmless as a value) so plugins can touch DOM members we
    // didn't model without throwing.
    return new Proxy(base, {
      get: function (t, p) {
        if (p in t) { return t[p]; }
        if (typeof p === "symbol") { return undefined; }
        return NOOP;
      },
      set: function (t, p, v) { t[p] = v; return true; },
      has: function () { return true; },
    });
  }

  function makeDocument() {
    var docEl = makeElement("html");
    var body = makeElement("body");
    var head = makeElement("head");
    return {
      nodeType: 9,
      documentElement: docEl,
      body: body,
      head: head,
      defaultView: null,
      createElement: function (tag) { return makeElement(tag, "http://www.w3.org/1999/xhtml"); },
      createElementNS: function (ns, tag) { return makeElement(tag, ns); },
      createTextNode: function (text) { return { nodeType: 3, textContent: text == null ? "" : String(text), data: text == null ? "" : String(text) }; },
      createComment: function () { return { nodeType: 8 }; },
      createDocumentFragment: function () { return makeElement("#fragment"); },
      createEvent: function () { return { initEvent: NOOP }; },
      getElementById: function () { return null; },
      getElementsByTagName: function () { return []; },
      getElementsByClassName: function () { return []; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: NOOP,
      removeEventListener: NOOP,
      createRange: function () {
        return { setStart: NOOP, setEnd: NOOP, getBoundingClientRect: function () { return { width: 0, height: 0 }; }, getClientRects: function () { return []; } };
      },
    };
  }

  // ----------------------------------------------------- install global shim

  var g = globalThis;
  if (typeof g.document === "undefined") { g.document = makeDocument(); }
  if (typeof g.window === "undefined") { g.window = g; }
  if (typeof g.self === "undefined") { g.self = g; }
  if (typeof g.navigator === "undefined") { g.navigator = { userAgent: "MetabaseCustomVizValidator", language: "en", languages: ["en"] }; }
  if (typeof g.location === "undefined") { g.location = { href: "about:blank", origin: "null", protocol: "about:", search: "", hash: "" }; }
  if (typeof g.console === "undefined") { g.console = { log: NOOP, warn: NOOP, error: NOOP, info: NOOP, debug: NOOP }; }

  g.requestAnimationFrame = g.requestAnimationFrame || function () { return 0; };
  g.cancelAnimationFrame = g.cancelAnimationFrame || NOOP;
  g.setTimeout = g.setTimeout || function () { return 0; };
  g.clearTimeout = g.clearTimeout || NOOP;
  g.setInterval = g.setInterval || function () { return 0; };
  g.clearInterval = g.clearInterval || NOOP;
  g.queueMicrotask = g.queueMicrotask || NOOP;
  g.getComputedStyle = g.getComputedStyle || function () { return makeStyle(); };
  g.matchMedia = g.matchMedia || function () { return { matches: false, addListener: NOOP, removeListener: NOOP, addEventListener: NOOP, removeEventListener: NOOP }; };

  function StubObserver() {}
  StubObserver.prototype.observe = NOOP;
  StubObserver.prototype.unobserve = NOOP;
  StubObserver.prototype.disconnect = NOOP;
  StubObserver.prototype.takeRecords = function () { return []; };
  g.ResizeObserver = g.ResizeObserver || StubObserver;
  g.IntersectionObserver = g.IntersectionObserver || StubObserver;
  g.MutationObserver = g.MutationObserver || StubObserver;

  // `instanceof` guards against these should not throw.
  function StubNode() {}
  g.Node = g.Node || StubNode;
  g.Element = g.Element || StubNode;
  g.HTMLElement = g.HTMLElement || StubNode;
  g.SVGElement = g.SVGElement || StubNode;
  g.Event = g.Event || function () {};
  g.CustomEvent = g.CustomEvent || function () {};

  // --------------------------------------------------- __METABASE_VIZ_API__

  function typeText(col) {
    if (!col) { return ""; }
    return String(col.base_type || "") + "|" + String(col.effective_type || "") + "|" + String(col.semantic_type || "");
  }
  function anyOf(col, needles) {
    var s = typeText(col);
    for (var i = 0; i < needles.length; i++) { if (s.indexOf(needles[i]) !== -1) { return true; } }
    return false;
  }
  var isNumeric = function (c) { return anyOf(c, ["Integer", "BigInteger", "Float", "Decimal", "Number"]); };
  var isDate = function (c) { return anyOf(c, ["Date", "DateTime", "Temporal", "Instant"]); };
  var isString = function (c) { return anyOf(c, ["Text", "Category", "Name", "/Text"]); };
  var isBoolean = function (c) { return anyOf(c, ["Boolean"]); };
  var isLatitude = function (c) { return anyOf(c, ["Latitude"]); };
  var isLongitude = function (c) { return anyOf(c, ["Longitude"]); };

  var columnTypesBase = {
    isDate: isDate,
    isNumeric: isNumeric,
    isInteger: function (c) { return anyOf(c, ["Integer", "BigInteger"]); },
    isBoolean: isBoolean,
    isString: isString,
    isStringLike: isString,
    isSummable: isNumeric,
    isNumericBaseType: isNumeric,
    isDateWithoutTime: function (c) { return anyOf(c, ["Date"]) && !anyOf(c, ["DateTime", "Time"]); },
    isNumber: isNumeric,
    isFloat: function (c) { return anyOf(c, ["Float", "Decimal"]); },
    isTime: function (c) { return anyOf(c, ["Time"]); },
    isFK: function (c) { return anyOf(c, ["FK"]); },
    isPK: function (c) { return anyOf(c, ["PK"]); },
    isLatitude: isLatitude,
    isLongitude: isLongitude,
    isCoordinate: function (c) { return isLatitude(c) || isLongitude(c); },
    isCurrency: function (c) { return anyOf(c, ["Currency"]); },
    isPercentage: function (c) { return anyOf(c, ["Percentage"]); },
    isCategory: function (c) { return anyOf(c, ["Category"]); },
    isID: function (c) { return anyOf(c, ["PK", "FK"]); },
    isAny: function () { return true; },
    hasLatitudeAndLongitudeColumns: function (cols) {
      var lat = false, lon = false;
      (cols || []).forEach(function (c) { if (isLatitude(c)) { lat = true; } if (isLongitude(c)) { lon = true; } });
      return lat && lon;
    },
  };
  // Unknown predicates default to false so unmodelled checks don't throw.
  var columnTypes = new Proxy(columnTypesBase, {
    get: function (t, p) { return p in t ? t[p] : function () { return false; }; },
  });

  g.__METABASE_VIZ_API__ = {
    columnTypes: columnTypes,
    formatValue: function (v) { return v == null ? "" : String(v); },
    measureText: function (t) { var s = String(t == null ? "" : t); return { width: s.length * 7, height: 14 }; },
    measureTextWidth: function (t) { return String(t == null ? "" : t).length * 7; },
    measureTextHeight: function () { return 14; },
  };

  // ----------------------------------------------------------- the driver

  var ALLOWED_WIDGETS = [
    "input", "number", "radio", "select", "toggle",
    "segmentedControl", "field", "fields", "color", "multiselect",
  ];

  g.__validate__ = function () {
    var factory = g.__customVizPlugin__;
    if (typeof factory !== "function") {
      return JSON.stringify({ ok: false, stage: "factory", error: "The bundle did not assign a factory function to __customVizPlugin__. Make sure factory_js evaluates to a function." });
    }

    var def;
    try {
      def = factory({ defineSetting: function (d) { return d; }, locale: "en" });
    } catch (e) {
      return JSON.stringify({ ok: false, stage: "factory-call", error: "Calling the factory function threw: " + errString(e) });
    }

    if (!def || typeof def !== "object") {
      return JSON.stringify({ ok: false, stage: "definition", error: "The factory must return an object, got " + (def === null ? "null" : typeof def) + "." });
    }
    if (typeof def.mount !== "function") {
      return JSON.stringify({ ok: false, stage: "definition", error: "The returned object must have a `mount` function." });
    }
    if (def.getName != null && typeof def.getName !== "function") {
      return JSON.stringify({ ok: false, stage: "definition", error: "`getName` must be a function returning the visualization name." });
    }
    if (typeof def.checkRenderable !== "undefined" && typeof def.checkRenderable !== "function") {
      return JSON.stringify({ ok: false, stage: "definition", error: "`checkRenderable`, when present, must be a function." });
    }

    if (def.settings != null) {
      if (typeof def.settings !== "object") {
        return JSON.stringify({ ok: false, stage: "settings", error: "`settings` must be an object keyed by setting id." });
      }
      for (var key in def.settings) {
        if (!Object.prototype.hasOwnProperty.call(def.settings, key)) { continue; }
        var s = def.settings[key];
        var widget = s && s.widget;
        if (ALLOWED_WIDGETS.indexOf(widget) === -1) {
          return JSON.stringify({ ok: false, stage: "settings", error: "Setting \"" + key + "\" has an unsupported widget " + JSON.stringify(widget) + ". Use one of: " + ALLOWED_WIDGETS.join(", ") + "." });
        }
      }
    }

    var series = g.__SERIES__ || [];
    var settings = g.__SETTINGS__ || {};
    // Match the first Metabot inline render slot: a 54rem-wide message column
    // with a 24rem-tall visualization body at the default 16px root font size.
    var props = {
      width: 864, height: 384, series: series, settings: settings,
      colorScheme: "light", onClick: NOOP, onHover: NOOP,
    };

    // checkRenderable is data-shape validation; a throw here may just mean the
    // sample data does not fit, so it is reported softly, never as a hard fail.
    var renderableError = null;
    if (typeof def.checkRenderable === "function") {
      try { def.checkRenderable(series, settings); }
      catch (e) { renderableError = errString(e); }
    }

    var container = g.document.createElement("div");
    var handle;
    try {
      handle = def.mount(container, props);
    } catch (e) {
      return JSON.stringify({ ok: false, stage: "mount", error: "mount() threw while rendering: " + errString(e), renderableError: renderableError });
    }
    if (!handle || typeof handle.update !== "function" || typeof handle.unmount !== "function") {
      return JSON.stringify({ ok: false, stage: "mount-handle", error: "mount() must return an object with `update` and `unmount` functions." });
    }
    try { handle.update(props); }
    catch (e) { return JSON.stringify({ ok: false, stage: "update", error: "The handle's update() threw: " + errString(e), renderableError: renderableError }); }
    try { handle.unmount(); }
    catch (e) { return JSON.stringify({ ok: false, stage: "unmount", error: "The handle's unmount() threw: " + errString(e), renderableError: renderableError }); }

    return JSON.stringify({ ok: true, renderableError: renderableError });
  };
})();
