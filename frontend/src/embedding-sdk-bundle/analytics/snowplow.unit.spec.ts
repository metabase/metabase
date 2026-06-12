import type { SelfDescribingJson } from "@snowplow/browser-tracker";

const mockNewTracker = jest.fn();
const mockTrackSelfDescribingEvent = jest.fn();

jest.mock("@snowplow/browser-tracker", () => ({
  newTracker: mockNewTracker,
  trackSelfDescribingEvent: mockTrackSelfDescribingEvent,
}));

// Re-import the module under test so its module-scoped init guard resets per test.
const loadModule = () => import("./snowplow");

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

      initSdkTracker("https://metabase.example.com");

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

      initSdkTracker("https://metabase.example.com");
      initSdkTracker("https://metabase.example.com");

      expect(mockNewTracker).toHaveBeenCalledTimes(1);
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
