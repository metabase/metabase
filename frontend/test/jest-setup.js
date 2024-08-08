import { TextEncoder, TextDecoder } from "util";
import "cross-fetch/polyfill";
import "raf/polyfill";
import "jest-localstorage-mock";
import "jest-canvas-mock";
import "metabase/lib/dayjs";
import "__support__/mocks";

// NOTE: this is needed because sometimes asynchronous code tries to access
// window.location or similar jsdom properties after the tests have ended and
// jsdom has been torn down
// NOTE: probably not needed in jest >= 23
process.on("uncaughtException", err =>
  console.error("WARNING: UNCAUGHT EXCEPTION", err),
);

if (process.env["DISABLE_LOGGING"] || process.env["DISABLE_LOGGING_FRONTEND"]) {
  global.console = {
    ...console.log,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  };
}

// global TextEncoder is not available in jsdom + Jest, see
// https://stackoverflow.com/questions/70808405/how-to-set-global-textdecoder-in-jest-for-jsdom-if-nodes-util-textdecoder-is-ty
// (hacky fix)
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// https://github.com/jsdom/jsdom/issues/3002
Range.prototype.getBoundingClientRect = () => ({
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
});
