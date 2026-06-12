import type { SelfDescribingJson } from "@snowplow/browser-tracker";

import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import { createMockSettingsState } from "metabase/redux/store/mocks/settings";
import { createMockState } from "metabase/redux/store/mocks/state";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

const mockNewTracker = jest.fn();
const mockTrackSelfDescribingEvent = jest.fn();

jest.mock("@snowplow/browser-tracker", () => ({
  newTracker: mockNewTracker,
  trackSelfDescribingEvent: mockTrackSelfDescribingEvent,
}));

// Re-import the module under test so its module-scoped init guard resets per test.
const loadModule = () => import("./snowplow");

function makeStore(overrides: Partial<EnterpriseSettings> = {}) {
  return {
    getState: () =>
      createMockState({
        sdk: createMockSdkState(),
        settings: createMockSettingsState({
          "anon-tracking-enabled": true,
          ...overrides,
        }),
      }),
  };
}

describe("embedding-sdk-bundle/analytics/snowplow (CSP transport)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe("initSdkTracker", () => {
    // Assert only the flags whose absence fails silently in a customer's prod app:
    // proxy path (CSP), server anonymisation (privacy), and no host-page storage.
    // CORS: 3.1.6 hardcoded withCredentials=true with no config option; 3.2.0 added
    // withCredentials as a config, so we pin it false to satisfy wildcard CORS on the proxy.
    // The rest is cosmetic config, not a safety contract.
    it("configures the proxy path, anonymises, and touches no storage", async () => {
      const { initSdkTracker } = await loadModule();

      initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store: makeStore(),
      });

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

      initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store: makeStore(),
      });
      initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store: makeStore(),
      });

      expect(mockNewTracker).toHaveBeenCalledTimes(1);
    });

    it("wasJustInitialized: true on first call, false on subsequent calls", async () => {
      const { initSdkTracker } = await loadModule();

      const firstResult = initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store: makeStore(),
      });
      const secondResult = initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store: makeStore(),
      });

      expect(firstResult).toBe(true);
      expect(secondResult).toBe(false);
    });

    it("attaches the instance context with analytics-uuid to every event", async () => {
      const { initSdkTracker } = await loadModule();

      initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store: makeStore({
          "analytics-uuid": "test-uuid-123",
          version: { tag: "v0.50.0" },
          "instance-creation": "2024-01-01",
          "token-features": createMockTokenFeatures(),
        }),
      });

      const [, , config] = mockNewTracker.mock.lastCall!;
      const [plugin] = config.plugins;
      const contexts = plugin.contexts();

      expect(contexts).toContainEqual(
        expect.objectContaining({
          schema: "iglu:com.metabase/instance/jsonschema/1-1-0",
          data: expect.objectContaining({ id: "test-uuid-123" }),
        }),
      );
    });
  });

  describe("getSdkAuthMethod", () => {
    it("returns undefined before initSdkTracker is called", async () => {
      const { getSdkAuthMethod } = await loadModule();

      expect(getSdkAuthMethod()).toBeUndefined();
    });

    it("returns the auth method passed to initSdkTracker", async () => {
      const { initSdkTracker, getSdkAuthMethod } = await loadModule();

      initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "api_key",
        localeUsed: false,
        store: makeStore(),
      });

      expect(getSdkAuthMethod()).toBe("api_key");
    });
  });

  describe("getSdkLocaleUsed", () => {
    it("returns false before initSdkTracker is called", async () => {
      const { getSdkLocaleUsed } = await loadModule();

      expect(getSdkLocaleUsed()).toBe(false);
    });

    it("returns the locale_used flag passed to initSdkTracker", async () => {
      const { initSdkTracker, getSdkLocaleUsed } = await loadModule();

      initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: true,
        store: makeStore(),
      });

      expect(getSdkLocaleUsed()).toBe(true);
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
