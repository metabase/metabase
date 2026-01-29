import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register happy-dom globals FIRST - before any other imports
GlobalRegistrator.register();

// Now dynamically import everything else
const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");
await import("@testing-library/jest-dom");

// Setup fetch-mock
const fetchMock = (await import("fetch-mock")).default;

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
});
