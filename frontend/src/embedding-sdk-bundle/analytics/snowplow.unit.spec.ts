import { seedApiQueryCache } from "__support__/rtk-query-cache";
import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import { createMockState } from "metabase/redux/store/mocks/state";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

const mockNewTracker = jest.fn();
const mockTrackSelfDescribingEvent = jest.fn();
const mockTrackMetaplowEvent = jest.fn();

// The factories reference the shared jest.fn()s lazily (via wrappers): the
// top-level `metabase/redux/store/mocks/api` import transitively imports
// `@snowplow/browser-tracker`, so the hoisted factories execute before the
// consts above initialize — a direct reference would hit the TDZ.
jest.mock("@snowplow/browser-tracker", () => ({
  newTracker: (...args: unknown[]) => mockNewTracker(...args),
  trackSelfDescribingEvent: (...args: unknown[]) =>
    mockTrackSelfDescribingEvent(...args),
}));

jest.mock("metabase/utils/metaplow", () => ({
  trackMetaplowEvent: (...args: unknown[]) => mockTrackMetaplowEvent(...args),
}));

// Re-import the module under test so its module-scoped init guard resets per test.
const loadModule = () => import("./snowplow");

function makeStore(overrides: Partial<EnterpriseSettings> = {}) {
  // Settings live in the `getSessionProperties` RTK Query cache (read via
  // `getSettings`), so seed that cache entry rather than a `settings` slice.
  const state = createMockState({ sdk: createMockSdkState() });
  const stateWithSettings = {
    ...state,
    "metabase-api": seedApiQueryCache(state["metabase-api"], [
      {
        endpointName: "getSessionProperties",
        value: createMockSettings({
          "anon-tracking-enabled": true,
          ...overrides,
        }),
      },
    ]),
  };
  return {
    getState: () => stateWithSettings,
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
      // Only assert important config keys
      expect(mockNewTracker).toHaveBeenCalledWith(
        "sdk",
        "https://metabase.example.com",
        expect.objectContaining({
          postPath: "/api/analytics-proxy",
          stateStorageStrategy: "none",
          anonymousTracking: { withServerAnonymisation: true },
          withCredentials: false,
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
      const store = makeStore();

      const firstResult = initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store,
      });
      const secondResult = initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store,
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

  describe("trackSdkSimpleEvent", () => {
    it("sends via SDK Snowplow proxy tracker with simple_event schema", async () => {
      const { trackSdkSimpleEvent } = await loadModule();

      trackSdkSimpleEvent({
        event: "embedding_sdk_initialized",
        event_detail: JSON.stringify({
          global: {
            auth_method: "sso",
            sdk_version: "1.0.0",
            locale_used: false,
          },
        }),
      });

      expect(mockTrackSelfDescribingEvent).toHaveBeenCalledWith(
        {
          event: {
            schema: "iglu:com.metabase/simple_event/jsonschema/1-0-0",
            data: {
              event: "embedding_sdk_initialized",
              event_detail: JSON.stringify({
                global: {
                  auth_method: "sso",
                  sdk_version: "1.0.0",
                  locale_used: false,
                },
              }),
            },
          },
        },
        ["sdk"],
      );
    });

    it("does not call Metaplow when the tracker has not been initialized", async () => {
      const { trackSdkSimpleEvent } = await loadModule();

      trackSdkSimpleEvent({
        event: "embedding_sdk_initialized",
        event_detail: "",
      });

      expect(mockTrackMetaplowEvent).not.toHaveBeenCalled();
    });

    it("does not call Metaplow when metaplow-tracking-enabled is false", async () => {
      const { initSdkTracker, trackSdkSimpleEvent } = await loadModule();

      initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store: makeStore({ "metaplow-tracking-enabled": false }),
      });

      trackSdkSimpleEvent({
        event: "embedding_sdk_initialized",
        event_detail: "",
      });

      expect(mockTrackMetaplowEvent).not.toHaveBeenCalled();
    });

    it("calls Metaplow when metaplow-tracking-enabled is on", async () => {
      const { initSdkTracker, trackSdkSimpleEvent } = await loadModule();

      initSdkTracker({
        metabaseInstanceUrl: "https://metabase.example.com",
        authMethod: "sso",
        localeUsed: false,
        store: makeStore({ "metaplow-tracking-enabled": true }),
      });

      trackSdkSimpleEvent({
        event: "embedding_sdk_initialized",
        event_detail: JSON.stringify({
          global: {
            auth_method: "sso",
            sdk_version: "1.0.0",
            locale_used: false,
          },
        }),
      });

      expect(mockTrackMetaplowEvent).toHaveBeenCalledWith(
        "embedding_sdk_initialized",
        {
          event_detail: JSON.stringify({
            global: {
              auth_method: "sso",
              sdk_version: "1.0.0",
              locale_used: false,
            },
          }),
        },
      );
    });
  });
});
