// @ts-nocheck
/* eslint-disable import/no-commonjs */

/**
 * Minimal `setupFiles` entry for the standalone query_builder Jest project.
 * Written from scratch — does not reuse frontend/test/jest-setup.js etc.
 *
 * Runs once per test file, before the test framework is installed.
 */
import { webcrypto } from "crypto";
import { TextDecoder, TextEncoder } from "util";

import { ReadableStream } from "web-streams-polyfill";
import "cross-fetch/polyfill";
import "raf/polyfill";
import "jest-canvas-mock";

import "metabase/utils/dayjs";

// --- Node <-> browser global shims --------------------------------------

Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  writable: true,
  configurable: true,
});

class JSDOMTextEncoder extends TextEncoder {
  encode(...args) {
    const result = super.encode(...args);
    if (!(result instanceof global.Uint8Array)) {
      return new global.Uint8Array(result);
    }
    return result;
  }
}

global.TextEncoder = JSDOMTextEncoder;
global.TextDecoder = TextDecoder;
global.ReadableStream = ReadableStream;

// Asynchronous code (e.g. floating-ui positioning) sometimes throws after a
// test finishes and jsdom has been torn down. Without this handler such an
// uncaught exception crashes the whole Jest worker process.
process.on("uncaughtException", (err) => {
  if (
    err?.message?.includes(
      "Cannot read properties of undefined (reading 'left')",
    )
  ) {
    return;
  }

  console.error("WARNING: UNCAUGHT EXCEPTION", err);
});

// --- jsdom gaps ----------------------------------------------------------

global.ga = () => {};
global.snowplow = () => {};

if (typeof window !== "undefined") {
  global.window.matchMedia = () => ({
    addEventListener: () => {},
    removeEventListener: () => {},
  });

  global.window.HTMLElement.prototype.scrollBy = jest.fn();
  global.window.HTMLElement.prototype.scrollTo = jest.fn();
  global.window.HTMLElement.prototype.scrollIntoView = jest.fn();

  global.window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  const originalGetComputedStyle =
    global.window.getComputedStyle.bind(global.window);
  global.window.getComputedStyle = (element, pseudoElement) => {
    const style = originalGetComputedStyle(element, pseudoElement);

    [
      "marginLeft",
      "marginRight",
      "paddingLeft",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
    ].forEach((property) => {
      if (style[property] === "") {
        Object.defineProperty(style, property, {
          configurable: true,
          value: "0px",
        });
      }
    });

    return style;
  };
}

if (typeof Range !== "undefined") {
  Range.prototype.getBoundingClientRect = () => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
  });

  Range.prototype.getClientRects = () => ({
    0: { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 },
    length: 1,
    item: () => null,
    [Symbol.iterator]: function* () {
      yield this[0];
    },
  });
}

if (typeof Element !== "undefined") {
  Element.prototype.getBoundingClientRect = () => ({
    bottom: 200,
    height: 200,
    left: 0,
    right: 200,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => {},
  });

  Element.prototype.getClientRects =
    Element.prototype.getClientRects ||
    (() => ({
      0: { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 },
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {
        yield this[0];
      },
    }));
}

if (typeof HTMLElement !== "undefined") {
  ["offsetWidth", "offsetHeight", "clientWidth", "clientHeight"].forEach(
    (property) => {
      Object.defineProperty(HTMLElement.prototype, property, {
        configurable: true,
        get() {
          return 200;
        },
      });
    },
  );

  ["scrollWidth", "scrollHeight"].forEach((property) => {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get() {
        return Math.max(200, this[property.replace("scroll", "client")]);
      },
    });
  });
}

if (typeof document !== "undefined") {
  document.elementFromPoint = document.elementFromPoint || (() => null);
  document.elementsFromPoint = document.elementsFromPoint || (() => []);
}

// --- module mocks --------------------------------------------------------

jest.mock("metabase/analytics");

jest.mock("react/jsx-runtime", () => {
  const actual = jest.requireActual("react/jsx-runtime");
  const sanitizeProps = (props) => {
    if (!props?.style || typeof props.style !== "object") {
      return props;
    }

    let style;
    for (const [key, value] of Object.entries(props.style)) {
      if (typeof value === "number" && Number.isNaN(value)) {
        style = style || { ...props.style };
        style[key] = 0;
      }
    }

    return style ? { ...props, style } : props;
  };

  return {
    ...actual,
    jsx: (type, props, key) => actual.jsx(type, sanitizeProps(props), key),
    jsxs: (type, props, key) => actual.jsxs(type, sanitizeProps(props), key),
  };
});

jest.mock("react/jsx-dev-runtime", () => {
  const actual = jest.requireActual("react/jsx-dev-runtime");
  const sanitizeProps = (props) => {
    if (!props?.style || typeof props.style !== "object") {
      return props;
    }

    let style;
    for (const [key, value] of Object.entries(props.style)) {
      if (typeof value === "number" && Number.isNaN(value)) {
        style = style || { ...props.style };
        style[key] = 0;
      }
    }

    return style ? { ...props, style } : props;
  };

  return {
    ...actual,
    jsxDEV: (type, props, key, isStaticChildren, source, self) =>
      actual.jsxDEV(
        type,
        sanitizeProps(props),
        key,
        isStaticChildren,
        source,
        self,
      ),
  };
});

// ExplicitSize must be mocked before visualizations register, otherwise
// charts measure a 0x0 viewport and skip rendering error/empty states.
jest.mock("metabase/common/components/ExplicitSize", () =>
  require("metabase/common/components/ExplicitSize/__mocks__/ExplicitSize"),
);

// NativeQueryEditor pulls in the CodeMirror editor; mock it so tests don't
// depend on a real editor instance.
jest.mock("metabase/query_builder/components/NativeQueryEditor", () =>
  require("metabase/query_builder/components/NativeQueryEditor/__mocks__/NativeQueryEditor"),
);

jest.mock("@uiw/react-codemirror", () => {
  const { forwardRef } = jest.requireActual("react");

  const MockEditor = forwardRef((props, ref) => {
    const {
      indentWithTab,
      extensions,
      basicSetup,
      editable,
      onCreateEditor,
      onUpdate,
      ...rest
    } = props;
    return (
      <textarea
        ref={ref}
        {...rest}
        value={props.value ?? ""}
        onChange={(evt) => props.onChange?.(evt.target.value, undefined)}
        autoFocus
        disabled={editable === false}
      />
    );
  });

  return {
    __esModule: true,
    ...jest.requireActual("@uiw/react-codemirror"),
    default: MockEditor,
  };
});
