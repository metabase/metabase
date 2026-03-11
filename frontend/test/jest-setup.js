import "raf/polyfill";
import "jest-canvas-mock";
import "metabase/utils/dayjs";
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

// Patch TextEncoder.encode to coerce to jsdom's Uint8Array.
// jest-fixed-jsdom exposes Node's TextEncoder, but its encode() returns
// Node's Uint8Array which fails instanceof checks in modules evaluated in
// jsdom's VM context (e.g. jose).
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
