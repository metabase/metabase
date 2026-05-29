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
    it("points the tracker at the instance proxy with a CORS/CSP-safe, anonymous config", async () => {
      const { initSdkTracker } = await loadModule();

      initSdkTracker("https://metabase.example.com");

      expect(mockNewTracker).toHaveBeenCalledTimes(1);
      expect(mockNewTracker).toHaveBeenCalledWith(
        "sdk",
        "https://metabase.example.com",
        expect.objectContaining({
          appId: "metabase",
          platform: "web",
          eventMethod: "post",
          postPath: "/api/analytics-proxy",
          credentials: "omit",
          keepalive: true,
          bufferSize: 1,
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
    it("sends a self-describing event through the named sdk tracker, schema-agnostic", async () => {
      const { trackSdkEvent } = await loadModule();
      // Existing embedded_analytics_js schema used only as a temporary test vehicle (Half 1).
      const event: SelfDescribingJson = {
        schema: "iglu:com.metabase/embedded_analytics_js/jsonschema/3-0-0",
        data: { event: "setup" },
      };

      trackSdkEvent(event);

      expect(mockTrackSelfDescribingEvent).toHaveBeenCalledTimes(1);
      expect(mockTrackSelfDescribingEvent).toHaveBeenCalledWith({ event }, [
        "sdk",
      ]);
    });
  });

  describe("isSdkTrackingEnabled", () => {
    it("requires both anonymous-tracking and snowplow to be enabled", async () => {
      const { isSdkTrackingEnabled } = await loadModule();

      expect(isSdkTrackingEnabled(true, true)).toBe(true);
      expect(isSdkTrackingEnabled(true, false)).toBe(false);
      expect(isSdkTrackingEnabled(false, true)).toBe(false);
      expect(isSdkTrackingEnabled(false, false)).toBe(false);
    });
  });
});
