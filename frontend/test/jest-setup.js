import { webcrypto } from "crypto";
import { TextDecoder, TextEncoder } from "util";

import { ReadableStream } from "web-streams-polyfill";
import "cross-fetch/polyfill";
import "raf/polyfill";
import "jest-canvas-mock";
import "metabase/lib/dayjs";
import "__support__/mocks";

// NOTE: this is needed because sometimes asynchronous code tries to access
// window.location or similar jsdom properties after the tests have ended and
// jsdom has been torn down
// NOTE: probably not needed in jest >= 23
process.on("uncaughtException", (err) =>
  console.error("WARNING: UNCAUGHT EXCEPTION", err),
);

if (process.env["DISABLE_LOGGING"] || process.env["DISABLE_LOGGING_FRONTEND"]) {
  global.console = {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };
}

// Patch TextEncoder to coerce to global Uint8Array
class JSDOMTextEncoder extends TextEncoder {
  encode(...args) {
    const result = super.encode(...args);
    if (!(result instanceof global.Uint8Array)) {
      return new global.Uint8Array(result);
    }
    return result;
  }
}

// global TextEncoder and Crypto are not available in jsdom + Jest, see
// https://stackoverflow.com/questions/70808405/how-to-set-global-textdecoder-in-jest-for-jsdom-if-nodes-util-textdecoder-is-ty
// Use Node.js native webcrypto instead of @peculiar/webcrypto polyfill
Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  writable: true,
  configurable: true,
});
global.TextEncoder = JSDOMTextEncoder;
global.TextDecoder = TextDecoder;

// replace node's ReadableStream what one that matches what is in the browser
global.ReadableStream = ReadableStream;

// https://github.com/jsdom/jsdom/issues/3002
Range.prototype.getBoundingClientRect = () => ({
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
});

// Mock getClientRects for ProseMirror/TipTap compatibility in tests
Range.prototype.getClientRects = () => ({
  0: {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
  },
  length: 1,
  item: () => null,
  [Symbol.iterator]: function* () {
    yield this[0];
  },
});

// Also mock for Elements which ProseMirror might try to call getClientRects on
Element.prototype.getClientRects =
  Element.prototype.getClientRects ||
  (() => ({
    0: {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
    },
    length: 1,
    item: () => null,
    [Symbol.iterator]: function* () {
      yield this[0];
    },
  }));

// Mock elementFromPoint for ProseMirror/TipTap compatibility in tests
document.elementFromPoint = document.elementFromPoint || (() => null);
document.elementsFromPoint = document.elementsFromPoint || (() => []);
