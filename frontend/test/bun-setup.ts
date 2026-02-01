import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register happy-dom globals FIRST - before any other imports
GlobalRegistrator.register();

// Set a proper base URL for fetch requests (happy-dom defaults to about:blank which has null origin)
window.happyDOM?.setURL("http://localhost/");

// Configure React act() environment for testing
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Now dynamically import everything else
const { afterEach, beforeEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");
await import("@testing-library/jest-dom");
const { reinitialize: reinitializePlugins } = await import("metabase/plugins");

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
