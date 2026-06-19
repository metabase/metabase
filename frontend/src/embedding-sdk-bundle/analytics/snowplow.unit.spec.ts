import type { SelfDescribingJson } from "@snowplow/browser-tracker";

import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import { createMockSettingsState } from "metabase/redux/store/mocks/settings";
import { createMockState } from "metabase/redux/store/mocks/state";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

const mockNewTracker = jest.fn();
const mockTrackSelfDescribingEvent = jest.fn();
const mockGetSdkStore = jest.fn();
const mockTrackMetaplowEvent = jest.fn();

jest.mock("@snowplow/browser-tracker", () => ({
  newTracker: mockNewTracker,
  trackSelfDescribingEvent: mockTrackSelfDescribingEvent,
}));

jest.mock("embedding-sdk-bundle/store", () => ({
  getSdkStore: mockGetSdkStore,
}));

jest.mock("metabase/utils/metaplow", () => ({
  trackMetaplowEvent: mockTrackMetaplowEvent,
}));

// Settings is imported by transitive static imports, so its factory runs before
// const declarations are initialized (TDZ). Use inline jest.fn() and access
// the mock via jest.requireMock() instead.
// __esModule: true is required for Babel's _interopRequireDefault to find .default correctly.
jest.mock("metabase/utils/settings", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

// Re-import per test so the module-scoped trackerInitialized guard resets.
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
    mockGetSdkStore.mockReturnValue(makeStore());
  });

  describe("initSdkTracker", () => {
    // Assert only the flags whose absence fails silently in a customer's prod app:
    // proxy path (CSP), server anonymisation (privacy), and no host-page storage.
    it("configures the proxy path, anonymises, and touches no storage", async () => {
      const { initSdkTracker } = await loadModule();

      initSdkTracker({ metabaseInstanceUrl: "https://metabase.example.com" });

      expect(mockNewTracker).toHaveBeenCalledTimes(1);
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

      initSdkTracker({ metabaseInstanceUrl: "https://metabase.example.com" });
      initSdkTracker({ metabaseInstanceUrl: "https://metabase.example.com" });

      expect(mockNewTracker).toHaveBeenCalledTimes(1);
    });

    it("returns true on first call and false on subsequent calls", async () => {
      const { initSdkTracker } = await loadModule();

      expect(
        initSdkTracker({ metabaseInstanceUrl: "https://metabase.example.com" }),
      ).toBe(true);
      expect(
        initSdkTracker({ metabaseInstanceUrl: "https://metabase.example.com" }),
      ).toBe(false);
    });

    it("attaches the instance context with analytics-uuid to every event", async () => {
      mockGetSdkStore.mockReturnValue(
        makeStore({
          "analytics-uuid": "test-uuid-123",
          version: { tag: "v0.50.0" } as EnterpriseSettings["version"],
          "instance-creation": "2024-01-01",
          "token-features": createMockTokenFeatures(),
        }),
      );
      const { initSdkTracker } = await loadModule();

      initSdkTracker({ metabaseInstanceUrl: "https://metabase.example.com" });

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

  describe("trackSdkEvent", () => {
    it("routes to the isolated sdk tracker, not the main-app sp tracker", async () => {
      const { trackSdkEvent } = await loadModule();
      const event: SelfDescribingJson = {
        schema: "iglu:com.metabase/simple_event/jsonschema/1-0-0",
        data: { event: "embedding_sdk_initialized" },
      };

      trackSdkEvent(event);

      expect(mockTrackSelfDescribingEvent).toHaveBeenCalledWith({ event }, [
        "sdk",
      ]);
    });
  });

  describe("trackSdkSimpleEvent", () => {
    it("sends via SDK Snowplow proxy tracker with simple_event schema", async () => {
      const { trackSdkSimpleEvent } = await loadModule();

      trackSdkSimpleEvent({
        event: "embedding_sdk_initialized",
        event_detail: JSON.stringify({ sdk_version: "1.0.0" }),
      });

      expect(mockTrackSelfDescribingEvent).toHaveBeenCalledWith(
        {
          event: {
            schema: "iglu:com.metabase/simple_event/jsonschema/1-0-0",
            data: {
              event: "embedding_sdk_initialized",
              event_detail: JSON.stringify({ sdk_version: "1.0.0" }),
            },
          },
        },
        ["sdk"],
      );
    });

    it("does not call Metaplow when metaplow-tracking-enabled is off", async () => {
      const { trackSdkSimpleEvent } = await loadModule();

      trackSdkSimpleEvent({ event: "embedding_sdk_initialized" });

      expect(mockTrackMetaplowEvent).not.toHaveBeenCalled();
    });

    it("calls Metaplow when metaplow-tracking-enabled is on", async () => {
      jest
        .requireMock("metabase/utils/settings")
        .default.get.mockImplementation(
          (key: string) => key === "metaplow-tracking-enabled",
        );
      const { trackSdkSimpleEvent } = await loadModule();

      trackSdkSimpleEvent({
        event: "embedding_sdk_initialized",
        event_detail: JSON.stringify({ sdk_version: "1.0.0" }),
      });

      expect(mockTrackMetaplowEvent).toHaveBeenCalledWith(
        "embedding_sdk_initialized",
        { event_detail: JSON.stringify({ sdk_version: "1.0.0" }) },
      );
    });
  });
});
