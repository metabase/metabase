import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register happy-dom globals FIRST - before any other imports
GlobalRegistrator.register();

// Prevent bun from dumping entire DOM trees in test failures
const inspectCustom = Symbol.for("nodejs.util.inspect.custom");

// Simple element inspector
const elementInspector = function (this: Element) {
  try {
    if (this.outerHTML) {
      const html = this.outerHTML;
      return html.length > 200 ? html.slice(0, 200) + "..." : html;
    }
    return `[${this.nodeName}]`;
  } catch {
    return "[DOM Element]";
  }
};

// Patch all HTML element constructors from window
const elementConstructors = Object.getOwnPropertyNames(window).filter(
  (name) => name.startsWith("HTML") && name.endsWith("Element"),
);

for (const name of elementConstructors) {
  try {
    const ctor = (window as Record<string, unknown>)[name] as { prototype?: object };
    if (ctor?.prototype) {
      Object.defineProperty(ctor.prototype, inspectCustom, {
        value: elementInspector,
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // Ignore
  }
}

// Helper to add custom inspector to a prototype and all its ancestors
const addInspector = (
  obj: object | null | undefined,
  inspector: (this: unknown) => string,
) => {
  let proto = obj ? Object.getPrototypeOf(obj) : null;
  while (proto && proto !== Object.prototype) {
    if (!(inspectCustom in proto)) {
      try {
        Object.defineProperty(proto, inspectCustom, {
          value: inspector,
          writable: true,
          configurable: true,
        });
      } catch {
        // Ignore if we can't define property
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
};

// Create actual DOM instances to get their real prototypes
const div = document.createElement("div");
div.setAttribute("test", "value");
const text = document.createTextNode("test");
const comment = document.createComment("test");
const fragment = document.createDocumentFragment();

// Patch element prototypes
addInspector(div, function (this: Element) {
  try {
    if ("outerHTML" in this && typeof this.outerHTML === "string") {
      const html = this.outerHTML;
      return html.length > 200 ? html.slice(0, 200) + "..." : html;
    }
    if ("nodeName" in this) {
      return `[${this.nodeName}]`;
    }
  } catch {
    // Ignore errors
  }
  return "[DOM Node]";
});

// Patch document
addInspector(document, function () {
  return "[Document]";
});

// Patch text nodes
addInspector(text, function (this: Text) {
  try {
    const content = this.textContent || "";
    return `[Text "${content.slice(0, 50)}${content.length > 50 ? "..." : ""}"]`;
  } catch {
    return "[Text]";
  }
});

// Patch comment nodes
addInspector(comment, function () {
  return "[Comment]";
});

// Patch document fragment
addInspector(fragment, function () {
  return "[DocumentFragment]";
});

// Patch attributes - get from the div we created
const attrs = div.attributes;
addInspector(attrs, function (this: NamedNodeMap) {
  try {
    return `[NamedNodeMap length=${this.length}]`;
  } catch {
    return "[NamedNodeMap]";
  }
});

// Patch individual Attr
if (attrs.length > 0) {
  addInspector(attrs[0], function (this: Attr) {
    try {
      return `[Attr ${this.name}="${this.value}"]`;
    } catch {
      return "[Attr]";
    }
  });
}

// Patch NodeList - get from querySelectorAll
const nodeList = document.querySelectorAll("*");
addInspector(nodeList, function (this: NodeList) {
  try {
    return `[NodeList length=${this.length}]`;
  } catch {
    return "[NodeList]";
  }
});

// Patch HTMLCollection
const htmlCollection = document.getElementsByTagName("*");
addInspector(htmlCollection, function (this: HTMLCollection) {
  try {
    return `[HTMLCollection length=${this.length}]`;
  } catch {
    return "[HTMLCollection]";
  }
});

// Patch CSSStyleDeclaration
const style = div.style;
addInspector(style, function () {
  return "[CSSStyleDeclaration]";
});

// Patch computed style
const computedStyle = window.getComputedStyle(div);
addInspector(computedStyle, function () {
  return "[CSSStyleDeclaration]";
});

// Also add toJSON to prevent serialization in jest-dom matchers
const addToJSON = (obj: object | null | undefined) => {
  let proto = obj ? Object.getPrototypeOf(obj) : null;
  while (proto && proto !== Object.prototype) {
    if (!("toJSON" in proto)) {
      try {
        Object.defineProperty(proto, "toJSON", {
          value: function (this: Element) {
            try {
              if ("outerHTML" in this && typeof this.outerHTML === "string") {
                const html = this.outerHTML;
                return html.length > 200 ? html.slice(0, 200) + "..." : html;
              }
              if ("nodeName" in this) {
                return `[${this.nodeName}]`;
              }
            } catch {
              // Ignore
            }
            return "[DOM Node]";
          },
          writable: true,
          configurable: true,
        });
      } catch {
        // Ignore
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
};

addToJSON(div);
addToJSON(text);
addToJSON(comment);
addToJSON(fragment);
addToJSON(document);
addToJSON(attrs);
if (attrs.length > 0) addToJSON(attrs[0]);
addToJSON(nodeList);
addToJSON(htmlCollection);
addToJSON(style);
addToJSON(computedStyle);

// Clean up
div.remove();

// Patch Window object to prevent circular reference dumps
const windowProto = Object.getPrototypeOf(window);
if (windowProto && !(inspectCustom in windowProto)) {
  Object.defineProperty(windowProto, inspectCustom, {
    value: () => "[Window]",
    writable: true,
    configurable: true,
  });
}

// Also patch the window object directly
Object.defineProperty(window, inspectCustom, {
  value: () => "[Window]",
  writable: true,
  configurable: true,
});

// Set a proper base URL for fetch requests (happy-dom defaults to about:blank which has null origin)
window.happyDOM?.setURL("http://localhost/");

// Configure React act() environment for testing
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Now dynamically import everything else
const { afterEach, beforeEach, expect } = await import("bun:test");
const { cleanup, configure } = await import("@testing-library/react");
const jestDomMatchers = await import("@testing-library/jest-dom/matchers");
const { reinitialize: reinitializePlugins } = await import("metabase/plugins");

// Wrap jest-dom matchers to provide the expected Jest-like context
// jest-dom expects this.utils with stringify, color functions, and other utilities
const stringify = (value: unknown): string => {
  if (typeof value === "string") return `"${value}"`;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
};

// Identity function for color utilities (no colors in test output)
const identity = (str: string) => str;

const jestUtils = {
  stringify,
  matcherHint: (name: string) => name,
  printExpected: (val: unknown) => stringify(val),
  printReceived: (val: unknown) => stringify(val),
  // Color utilities - just return the string without color
  EXPECTED_COLOR: identity,
  RECEIVED_COLOR: identity,
  INVERTED_COLOR: identity,
  BOLD_WEIGHT: identity,
  DIM_COLOR: identity,
};

const wrappedMatchers: Record<string, (...args: unknown[]) => unknown> = {};
for (const [name, matcher] of Object.entries(jestDomMatchers)) {
  if (typeof matcher === "function") {
    wrappedMatchers[name] = function (this: unknown, ...args: unknown[]) {
      // Bun's ExpectMatcherContext has strict instance checking on getters.
      // We need to read the values from the original context, then create a plain
      // object with all the properties jest-dom expects.
      const bunContext = this as {
        isNot: boolean;
        equals: (a: unknown, b: unknown) => boolean;
        utils: object;
      };

      // Read values from Bun's context (these are getters that check instanceof)
      const isNot = bunContext.isNot;
      const equals = bunContext.equals?.bind(bunContext);

      // Create a plain object context for jest-dom
      const context = {
        isNot,
        equals: equals || ((a: unknown, b: unknown) => a === b),
        utils: {
          ...(bunContext.utils || {}),
          ...jestUtils,
        },
      };

      return (matcher as (...args: unknown[]) => unknown).apply(context, args);
    };
  }
}

expect.extend(wrappedMatchers);

// Configure testing-library to limit DOM output in error messages
configure({
  getElementError: (message, container) => {
    // Truncate the DOM output to avoid massive error messages
    const containerHtml = container?.innerHTML ?? "";
    const truncatedHtml =
      containerHtml.length > 500
        ? containerHtml.slice(0, 500) + "\n... (truncated)"
        : containerHtml;
    const error = new Error(
      [message, "Container HTML (truncated):", truncatedHtml].join("\n\n"),
    );
    error.name = "TestingLibraryElementError";
    return error;
  },
});

// Setup fetch-mock
const fetchMock = (await import("fetch-mock")).default;

// Enable fetch-mock to intercept fetch calls before each test
beforeEach(() => {
  fetchMock.mockGlobal();
});

// Import dayjs config
await import("metabase/lib/dayjs");

// MetabaseBootstrap config
window.MetabaseBootstrap = {
  "enable-xrays": true,
  "available-timezones": ["GMT", "UTC", "US/Alaska", "US/Arizona", "US/Central", "US/Eastern", "US/Hawaii", "US/Mountain", "US/Pacific"],
  "available-locales": [["en", "English"]],
  types: {
    "type/Text": ["type/*"],
    "type/Integer": ["type/Number"],
    "type/Float": ["type/Number"],
    "type/Number": ["type/*"],
    "type/Boolean": ["type/Category", "type/*"],
    "type/Temporal": ["type/*"],
    "type/Date": ["type/Temporal"],
    "type/DateTime": ["type/Temporal"],
    "type/Time": ["type/Temporal"],
  },
  version: { tag: "v1" },
};

// Global mocks
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

globalThis.ga = () => {};
globalThis.snowplow = () => {};

// Suppress noisy warnings that don't indicate real problems
const originalError = console.error;
console.error = (...args) => {
  const message = args[0];
  if (
    typeof message === "string" &&
    (message.includes("inside a test was not wrapped in act") ||
      message.includes("not configured to support act"))
  ) {
    return;
  }
  originalError.apply(console, args);
};

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  fetchMock.removeRoutes();
  fetchMock.callHistory.clear();
  fetchMock.unmockGlobal();
  reinitializePlugins();
});
