// jest.mock is hoisted before imports, so jest.fn() must be defined inline.
// External const refs (like `const mockFoo = jest.fn()`) cause TDZ errors.
jest.mock("./snowplow", () => ({
  trackSdkEvent: jest.fn(),
  getSdkAuthMethod: jest.fn(() => "sso"),
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getBuildInfo: jest.fn(() => ({ version: "1.2.3" })),
}));

// Block the full SDK Redux store (and its ClojureScript transitive deps) from
// loading in the Jest environment.
jest.mock("embedding-sdk-bundle/store", () => ({
  useSdkSelector: jest.fn(),
}));

import { renderHook } from "@testing-library/react";

import { useSdkSelector } from "embedding-sdk-bundle/store";

import { useTrackSdkComponentMount } from "./sdk-component-events";
import { trackSdkEvent } from "./snowplow";

const mockTrackSdkEvent = jest.mocked(trackSdkEvent);
const mockUseSdkSelector = jest.mocked(useSdkSelector);

// Unique entity IDs per test so the module-level firedKeys Set never causes
// cross-test interference (no jest.resetModules() needed).
let nextId = 1;
const uniqueId = () => nextId++;

describe("useTrackSdkComponentMount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Both selectors return the same value in most tests.
  const enableTracking = () => mockUseSdkSelector.mockReturnValue(true);

  it("fires one event when tracking is enabled and tracker is ready", () => {
    enableTracking();
    const entityId = uniqueId();

    renderHook(() =>
      useTrackSdkComponentMount("StaticDashboard", entityId, {
        with_title: true,
      }),
    );

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: "iglu:com.metabase/embedding_sdk/jsonschema/1-0-0",
        data: expect.objectContaining({
          component: "StaticDashboard",
          properties: { with_title: true },
          global: { auth_method: "sso", sdk_version: "1.2.3" },
        }),
      }),
    );
  });

  it("does not fire when tracking is disabled", () => {
    mockUseSdkSelector.mockReturnValue(false);

    renderHook(() =>
      useTrackSdkComponentMount("StaticDashboard", uniqueId(), {}),
    );

    expect(mockTrackSdkEvent).not.toHaveBeenCalled();
  });

  it("does not fire when isTrackingEnabled is true but isTrackerReady is false", () => {
    mockUseSdkSelector
      .mockReturnValueOnce(true) // isTrackingEnabled
      .mockReturnValueOnce(false); // isTrackerReady

    renderHook(() =>
      useTrackSdkComponentMount("StaticDashboard", uniqueId(), {}),
    );

    expect(mockTrackSdkEvent).not.toHaveBeenCalled();
  });

  it("deduplicates — re-renders with same key do not re-fire", () => {
    enableTracking();
    const entityId = uniqueId();

    const { rerender } = renderHook(() =>
      useTrackSdkComponentMount("InteractiveDashboard", entityId, {}),
    );
    rerender();
    rerender();

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(1);
  });

  it("deduplicates across separate hook instances with same presence key", () => {
    enableTracking();

    // First mount fires.
    renderHook(() =>
      useTrackSdkComponentMount("CollectionBrowser", null, { used: true }),
    );
    // Second mount — same dedup key (CollectionBrowser:presence), already fired.
    renderHook(() =>
      useTrackSdkComponentMount("CollectionBrowser", null, { used: true }),
    );

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(1);
  });

  it("fires separate events for different entity IDs", () => {
    enableTracking();
    const idA = uniqueId();
    const idB = uniqueId();

    renderHook(() => useTrackSdkComponentMount("StaticDashboard", idA, {}));
    renderHook(() => useTrackSdkComponentMount("StaticDashboard", idB, {}));

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(2);
  });

  it("uses the correct component name in the emitted event", () => {
    enableTracking();

    renderHook(() =>
      useTrackSdkComponentMount("MetabotQuestion", null, { layout: "auto" }),
    );

    expect(mockTrackSdkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ component: "MetabotQuestion" }),
      }),
    );
  });
});
