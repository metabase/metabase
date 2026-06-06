import type { SelfDescribingJson } from "@snowplow/browser-tracker";

import type { SdkStoreState } from "embedding-sdk-bundle/store/types";

const mockNewTracker = jest.fn();
const mockTrackSelfDescribingEvent = jest.fn();

jest.mock("@snowplow/browser-tracker", () => ({
  newTracker: mockNewTracker,
  trackSelfDescribingEvent: mockTrackSelfDescribingEvent,
}));

// Prevent the full SDK Redux store (and its ClojureScript transitive deps) from
// loading in the Jest environment. The snowplow transport tests never need a
// real store; externalStore is always passed in for the tests that exercise the
// context plugin.
jest.mock("embedding-sdk-bundle/store", () => ({
  getSdkStore: jest.fn(() => ({
    getState: () => ({ settings: { values: {} } }),
  })),
}));

// Re-import the module under test so its module-scoped init guard resets per test.
const loadModule = () => import("./snowplow");

const makeStore = (overrides: Record<string, unknown> = {}) =>
  ({
    getState: () => ({
      settings: { values: { "anon-tracking-enabled": true, ...overrides } },
    }),
  }) as unknown as { getState: () => SdkStoreState };

describe("embedding-sdk-bundle/analytics/snowplow (CSP transport)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe("initSdkTracker", () => {
    // Assert only the flags whose absence fails silently in a customer's prod app:
    // proxy path (CSP), server anonymisation (privacy), and no host-page storage.
    // CORS: v3 uses XHR which defaults to withCredentials=false (equivalent to "omit").
    // The rest is cosmetic config, not a safety contract.
    it("configures the proxy path, anonymises, and touches no storage", async () => {
      const { initSdkTracker } = await loadModule();

      initSdkTracker("https://metabase.example.com", "sso", makeStore());

      expect(mockNewTracker).toHaveBeenCalledTimes(1);
      expect(mockNewTracker).toHaveBeenCalledWith(
        "sdk",
        "https://metabase.example.com",
        // Only assert important config keys
        expect.objectContaining({
          postPath: "/api/analytics-proxy",
          stateStorageStrategy: "none",
          anonymousTracking: { withServerAnonymisation: true },
        }),
      );
    });

    it("is idempotent — a second call does not create another tracker", async () => {
      const { initSdkTracker } = await loadModule();

      initSdkTracker("https://metabase.example.com", "sso", makeStore());
      initSdkTracker("https://metabase.example.com", "sso", makeStore());

      expect(mockNewTracker).toHaveBeenCalledTimes(1);
    });

    it("returns true on first call and false on subsequent calls", async () => {
      const { initSdkTracker } = await loadModule();

      const firstResult = initSdkTracker(
        "https://metabase.example.com",
        "sso",
        makeStore(),
      );
      const secondResult = initSdkTracker(
        "https://metabase.example.com",
        "sso",
        makeStore(),
      );

      expect(firstResult).toBe(true);
      expect(secondResult).toBe(false);
    });
  });

  describe("getSdkAuthMethod", () => {
    it("returns null before initSdkTracker is called", async () => {
      const { getSdkAuthMethod } = await loadModule();

      expect(getSdkAuthMethod()).toBeNull();
    });

    it("returns the auth method passed to initSdkTracker", async () => {
      const { initSdkTracker, getSdkAuthMethod } = await loadModule();

      initSdkTracker("https://metabase.example.com", "api_key", makeStore());

      expect(getSdkAuthMethod()).toBe("api_key");
    });
  });

  describe("trackSdkEvent", () => {
    it("routes to the isolated sdk tracker, not the default", async () => {
      const { trackSdkEvent } = await loadModule();
      const event: SelfDescribingJson = {
        schema: "iglu:com.metabase/embedded_analytics_js/jsonschema/3-0-0",
        data: { event: "setup" },
      };

      trackSdkEvent(event);

      expect(mockTrackSelfDescribingEvent).toHaveBeenCalledWith({ event }, [
        "sdk",
      ]);
    });
  });
});
