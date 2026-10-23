jest.mock("embedding-sdk-bundle/analytics/component-events", () => ({
  ...jest.requireActual("embedding-sdk-bundle/analytics/component-events"),
  useIsTrackingEnabled: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/analytics/snowplow", () => ({
  trackSdkSimpleEvent: jest.fn(),
  getSdkAuthMethod: jest.fn(() => "sso"),
  getSdkClient: jest.fn(() => "embedding-sdk-react"),
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getSdkPackageVersion: jest.fn(() => "1.2.3"),
}));

jest.mock("embedding-sdk-bundle/analytics/start-time", () => ({
  getSdkBundleStartTime: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/analytics/phase-timestamps", () => ({
  getPhaseOffsets: jest.fn(() => null),
  recordPhase: jest.fn(),
  resetPhaseTimestamps: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/store", () => ({
  useSdkSelector: jest.fn(),
}));

import { useIsTrackingEnabled } from "embedding-sdk-bundle/analytics/component-events";
import { trackSdkSimpleEvent } from "embedding-sdk-bundle/analytics/snowplow";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { METAPLOW_WEBSITE_ID } from "metabase/utils/metaplow";

import type { ComponentSignal } from "./component-signals";
import {
  reportComponentReady,
  resetComponentSignals,
} from "./component-signals";
import { getPhaseOffsets } from "./phase-timestamps";
import {
  SDK_READY_TIMEOUT_MS,
  resetSdkReadyEvent,
  sendDirectSdkReadyEvent,
  sendSdkReadyEvent,
  useInitSdkReadyEvent,
} from "./sdk-ready-event";
import { getSdkBundleStartTime } from "./start-time";

const mockTrackSdkSimpleEvent = jest.mocked(trackSdkSimpleEvent);
const mockGetSdkBundleStartTime = jest.mocked(getSdkBundleStartTime);
const mockGetPhaseOffsets = jest.mocked(getPhaseOffsets);
const mockUseIsTrackingEnabled = jest.mocked(useIsTrackingEnabled);
const mockUseSdkSelector = jest.mocked(useSdkSelector);

const INSTANCE_URL = "https://metabase.example.com";

/** Extracts the `event_detail` string from the first mock call to `trackSdkSimpleEvent`. */
function getEventDetail(
  mock: jest.MockedFunction<typeof trackSdkSimpleEvent>,
): string {
  const call = mock.mock.calls[0][0];
  // The ready-event variant always carries event_detail; narrow from the union.
  return (call as { event_detail: string }).event_detail;
}

function makeReadySignal(
  overrides: Partial<ComponentSignal> = {},
): ComponentSignal {
  return {
    component: "StaticDashboard",
    status: "ready",
    timestamp: 1500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sendSdkReadyEvent (normal path)
// ---------------------------------------------------------------------------

describe("sendSdkReadyEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSdkReadyEvent();
    resetComponentSignals();
  });

  it("sends embedding_sdk_ready with correct fields for a ready signal", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });

    sendSdkReadyEvent(makeReadySignal({ timestamp: 1500 }));

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith({
      event: "embedding_sdk_ready",
      result: "ready",
      duration_ms: 1400,
      event_detail: JSON.stringify({
        component: "StaticDashboard",
        error_type: undefined,
        sdk_version: "1.2.3",
        auth_method: "sso",
        client: "embedding-sdk-react",
        bundle_cached: false,
        phases: { script_start: 0, bundle_ready: 100 },
      }),
    });
  });

  it("includes lifecycle phases from the phase store when available", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });
    mockGetPhaseOffsets.mockReturnValueOnce({
      init_start: 150,
      init_ready: 300,
    });

    sendSdkReadyEvent(makeReadySignal({ timestamp: 1500 }));

    const detail: unknown = JSON.parse(getEventDetail(mockTrackSdkSimpleEvent));
    expect(detail).toEqual(
      expect.objectContaining({
        phases: {
          script_start: 0,
          bundle_ready: 100,
          init_start: 150,
          init_ready: 300,
        },
      }),
    );
  });

  it("sends result 'error' with error_type for an error signal", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });

    sendSdkReadyEvent(
      makeReadySignal({
        status: "error",
        errorType: "auth_error",
        component: "InteractiveDashboard",
        timestamp: 800,
      }),
    );

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "error",
        duration_ms: 700,
        event_detail: expect.stringContaining('"error_type":"auth_error"'),
      }),
    );
  });

  it("sends duration_ms as null when start time is unknown", () => {
    mockGetSdkBundleStartTime.mockReturnValue(null);

    sendSdkReadyEvent(makeReadySignal());

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ duration_ms: null }),
    );
  });

  it("rounds duration_ms to an integer", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100.3,
      bundleReadyMs: 200,
      bundleCached: false,
    });

    sendSdkReadyEvent(makeReadySignal({ timestamp: 1500.7 }));

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ duration_ms: 1400 }),
    );
  });

  it("sends only once — second call is ignored", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });

    sendSdkReadyEvent(makeReadySignal());
    sendSdkReadyEvent(makeReadySignal({ component: "StaticQuestion" }));

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
  });

  it("sends bundle_cached null and phases null when start time is unknown", () => {
    mockGetSdkBundleStartTime.mockReturnValue(null);

    sendSdkReadyEvent(makeReadySignal());

    const detail: unknown = JSON.parse(getEventDetail(mockTrackSdkSimpleEvent));
    expect(detail).toEqual(
      expect.objectContaining({
        bundle_cached: null,
        phases: null,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// sendDirectSdkReadyEvent (fallback path)
// ---------------------------------------------------------------------------

describe("sendDirectSdkReadyEvent", () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSdkReadyEvent();
    resetComponentSignals();
    mockFetch = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it("sends a direct POST to the Metaplow proxy with the correct envelope", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: true,
    });

    sendDirectSdkReadyEvent(
      INSTANCE_URL,
      makeReadySignal({
        status: "error",
        errorType: "auth_error",
        timestamp: 3100,
      }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${INSTANCE_URL}/api/metaplow-proxy/send`);
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("omit");

    const body = JSON.parse(options.body);
    expect(body.type).toBe("event");
    expect(body.payload.website).toBe(METAPLOW_WEBSITE_ID);
    expect(body.payload.name).toBe("embedding_sdk_ready");
    expect(body.payload.data.result).toBe("error");
    expect(body.payload.data.duration_ms).toBe(3000);

    const detail = JSON.parse(body.payload.data.event_detail);
    expect(detail.error_type).toBe("auth_error");
    expect(detail.sdk_version).toBe("1.2.3");
  });

  it("sends only once — second call is ignored", () => {
    mockGetSdkBundleStartTime.mockReturnValue(null);

    sendDirectSdkReadyEvent(INSTANCE_URL, makeReadySignal());
    sendDirectSdkReadyEvent(INSTANCE_URL, makeReadySignal());

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("blocks the normal path after sending", () => {
    mockGetSdkBundleStartTime.mockReturnValue(null);

    sendDirectSdkReadyEvent(INSTANCE_URL, makeReadySignal());
    sendSdkReadyEvent(makeReadySignal());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
  });

  it("silently ignores fetch failures", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    mockGetSdkBundleStartTime.mockReturnValue(null);

    // Should not throw
    sendDirectSdkReadyEvent(INSTANCE_URL, makeReadySignal());

    // Flush the rejection
    await Promise.resolve();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// useInitSdkReadyEvent — normal path
// ---------------------------------------------------------------------------

describe("useInitSdkReadyEvent — normal path", () => {
  const { renderHook } = jest.requireActual("@testing-library/react");

  beforeEach(() => {
    jest.clearAllMocks();
    resetSdkReadyEvent();
    resetComponentSignals();
  });

  function setupHook({
    trackingEnabled = true,
    trackerReady = true,
  }: {
    trackingEnabled?: boolean;
    trackerReady?: boolean;
  } = {}) {
    mockUseIsTrackingEnabled.mockReturnValue(trackingEnabled);
    mockUseSdkSelector.mockImplementation((selector: any) =>
      selector({ sdk: { sdkTrackerReady: trackerReady } }),
    );

    return renderHook(() => useInitSdkReadyEvent(INSTANCE_URL));
  }

  it("sends via the normal path when tracker is ready and a signal was buffered", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 50,
      bundleReadyMs: 150,
      bundleCached: false,
    });
    reportComponentReady("CollectionBrowser");

    setupHook();

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "embedding_sdk_ready",
        result: "ready",
      }),
    );
  });

  it("sends when signal fires after the hook subscribes", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 50,
      bundleReadyMs: 150,
      bundleCached: false,
    });
    setupHook();

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();

    reportComponentReady("StaticQuestion");

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
  });

  it("sends when tracker becomes ready after signal was buffered", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 50,
      bundleReadyMs: 150,
      bundleCached: false,
    });
    reportComponentReady("InteractiveQuestion");

    // Tracker not ready on first render — no event yet.
    const { rerender } = setupHook({ trackerReady: false });
    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();

    // Tracker becomes ready — second effect picks up the buffered signal.
    mockUseSdkSelector.mockImplementation((selector: any) =>
      selector({ sdk: { sdkTrackerReady: true } }),
    );
    mockUseIsTrackingEnabled.mockReturnValue(true);
    rerender();

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "embedding_sdk_ready",
        result: "ready",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// useInitSdkReadyEvent — timeout
// ---------------------------------------------------------------------------

describe("useInitSdkReadyEvent — timeout", () => {
  const { renderHook, act } = jest.requireActual("@testing-library/react");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetSdkReadyEvent();
    resetComponentSignals();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setupHook({ trackerReady = true }: { trackerReady?: boolean } = {}) {
    mockUseIsTrackingEnabled.mockReturnValue(trackerReady);
    mockUseSdkSelector.mockImplementation((selector: any) =>
      selector({ sdk: { sdkTrackerReady: trackerReady } }),
    );

    return renderHook(() => useInitSdkReadyEvent(INSTANCE_URL));
  }

  it("sends timeout when no signal arrives within 45 seconds", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });
    jest.spyOn(performance, "now").mockReturnValue(100);

    setupHook();

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(SDK_READY_TIMEOUT_MS);
    });

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith({
      event: "embedding_sdk_ready",
      result: "timeout",
      duration_ms: null,
      event_detail: JSON.stringify({
        sdk_version: "1.2.3",
        auth_method: "sso",
        client: "embedding-sdk-react",
        bundle_cached: false,
        phases: { script_start: 0, bundle_ready: 100 },
      }),
    });
  });

  it("does not send timeout when a signal arrives before 45 seconds", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });
    jest.spyOn(performance, "now").mockReturnValue(100);

    setupHook();

    reportComponentReady("StaticDashboard");
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ result: "ready" }),
    );

    mockTrackSdkSimpleEvent.mockClear();

    act(() => {
      jest.advanceTimersByTime(SDK_READY_TIMEOUT_MS);
    });

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
  });

  it("computes remaining time from start time", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });
    jest.spyOn(performance, "now").mockReturnValue(20100);

    setupHook();

    act(() => {
      jest.advanceTimersByTime(24999);
    });
    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ result: "timeout" }),
    );
  });

  it("fires immediately when 45 seconds already passed before hook runs", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });
    jest.spyOn(performance, "now").mockReturnValue(50000);

    setupHook();

    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ result: "timeout" }),
    );
  });

  it("uses a full 45 seconds when start time is unknown", () => {
    mockGetSdkBundleStartTime.mockReturnValue(null);

    setupHook();

    act(() => {
      jest.advanceTimersByTime(SDK_READY_TIMEOUT_MS - 1);
    });
    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "timeout",
        event_detail: expect.stringContaining('"bundle_cached":null'),
      }),
    );
  });

  it("does not send a late signal after timeout", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });
    jest.spyOn(performance, "now").mockReturnValue(100);

    setupHook();

    act(() => {
      jest.advanceTimersByTime(SDK_READY_TIMEOUT_MS);
    });

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    mockTrackSdkSimpleEvent.mockClear();

    reportComponentReady("StaticDashboard");
    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
  });

  it("clears the timer on unmount", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });
    jest.spyOn(performance, "now").mockReturnValue(100);

    const { unmount } = setupHook();
    unmount();

    act(() => {
      jest.advanceTimersByTime(SDK_READY_TIMEOUT_MS);
    });

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
  });

  it("does not fire timeout when tracker is not ready", () => {
    mockGetSdkBundleStartTime.mockReturnValue({
      startTimeMs: 100,
      bundleReadyMs: 200,
      bundleCached: false,
    });
    jest.spyOn(performance, "now").mockReturnValue(100);

    setupHook({ trackerReady: false });

    act(() => {
      jest.advanceTimersByTime(SDK_READY_TIMEOUT_MS + 10_000);
    });

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
  });
});
