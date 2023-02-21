import "raf/polyfill";
import "jest-localstorage-mock";
import "jest-canvas-mock";
import "__support__/mocks";

// NOTE: this is needed because sometimes asynchronous code tries to access
// window.location or similar jsdom properties after the tests have ended and
// jsdom has been torn down
// NOTE: probably not needed in jest >= 23
process.on("uncaughtException", err =>
  console.error("WARNING: UNCAUGHT EXCEPTION", err),
);

// these functions are used by nock, but they are removed by jsdom
if (!global.setImmediate) {
  global.setImmediate = global.setTimeout;
  global.clearImmediate = global.clearTimeout;
}

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
