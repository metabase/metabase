import { TextEncoder, TextDecoder } from "util";
import "cross-fetch/polyfill";
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
} else {
  const originalConsoleError = console.error;
  const consoleErrorsBlacklist = [
    ["findDOMNode inside its render", "Popover"],
    "Warning: unmountComponentAtNode():",
  ];

  // It's always easier to hide the problem, but please don't overuse this place and
  // start with fixing the root cause of the error
  // TODO: good place to fail `fetch-mock: No fallback response defined for`
  jest.spyOn(global.console, "error").mockImplementation((...args) => {
    shouldHideConsoleError(args, consoleErrorsBlacklist) ||
      originalConsoleError(...args);
  });
}

function shouldHideConsoleError(args, blacklist) {
  return blacklist.some(blacklistedError => {
    if (Array.isArray(blacklistedError)) {
      if (typeof args[0] === "string" && typeof args[1] === "string") {
        const [errorMessage, componentName] = blacklistedError;
        return (
          args[0].includes(errorMessage) && args[1].includes(componentName)
        );
      }

      return false;
    }

    if (typeof blacklistedError === "string" && typeof args[0] === "string") {
      return args[0].includes(blacklistedError);
    }

    return false;
  });
}

// global TextEncoder is not available in jsdom + Jest, see
// https://stackoverflow.com/questions/70808405/how-to-set-global-textdecoder-in-jest-for-jsdom-if-nodes-util-textdecoder-is-ty
// (hacky fix)
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
