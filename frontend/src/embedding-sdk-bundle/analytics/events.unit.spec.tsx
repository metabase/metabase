// jest.mock is hoisted before imports, so jest.fn() must be defined inline.
// External const refs (like `const mockFoo = jest.fn()`) cause TDZ errors.
jest.mock("./snowplow", () => ({
  trackSdkEvent: jest.fn(),
  getSdkAuthMethod: jest.fn(() => "sso"),
  getSdkLocaleUsed: jest.fn(() => false),
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getSdkPackageVersion: jest.fn(() => "1.2.3"),
}));

import { renderHookWithProviders } from "__support__/ui";
import { sdkReducers } from "embedding-sdk-bundle/store";
import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { createMockSettings } from "metabase-types/api/mocks";

import type { SdkComponentName } from "./component-events";
import { useTrackSdkComponentMount } from "./component-events";
import { trackSdkEvent } from "./snowplow";

const mockTrackSdkEvent = jest.mocked(trackSdkEvent);

// Unique entity IDs per test so the module-level firedKeys Set never causes
// cross-test interference (no jest.resetModules() needed).
let nextId = 1;
const uniqueId = () => nextId++;

const STUB_DASHBOARD_PROPS = {
  with_title: false,
  with_downloads: false,
  with_subscriptions: false,
  auto_refresh: false,
  enable_entity_navigation: false,
};

interface SetupOptions {
  trackingEnabled?: boolean;
  sdkTrackerReady?: boolean;
  componentName: SdkComponentName;
  entityId?: number | null;
  properties?: Record<string, unknown>;
}

function setup({
  trackingEnabled = true,
  sdkTrackerReady = true,
  componentName,
  entityId = null,
  properties = {},
}: SetupOptions) {
  const { state } = setupSdkState({
    settingValues: createMockSettings({
      "anon-tracking-enabled": trackingEnabled,
    }),
    sdkState: createMockSdkState({ sdkTrackerReady }),
  });

  return renderHookWithProviders(
    () => useTrackSdkComponentMount(componentName, entityId, properties),
    { storeInitialState: state, customReducers: sdkReducers },
  );
}

describe("useTrackSdkComponentMount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fires one event when tracking is enabled and tracker is ready", () => {
    const entityId = uniqueId();

    setup({
      componentName: "StaticDashboard",
      entityId,
      properties: { ...STUB_DASHBOARD_PROPS, with_title: true },
    });

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: "iglu:com.metabase/embedding_sdk/jsonschema/1-0-0",
        data: expect.objectContaining({
          component: "StaticDashboard",
          properties: expect.objectContaining({ with_title: "true" }),
          global: {
            auth_method: "sso",
            sdk_version: "1.2.3",
            locale_used: false,
          },
        }),
      }),
    );
  });

  it("does not fire when tracking is disabled", () => {
    setup({
      trackingEnabled: false,
      componentName: "StaticDashboard",
      entityId: uniqueId(),
      properties: STUB_DASHBOARD_PROPS,
    });

    expect(mockTrackSdkEvent).not.toHaveBeenCalled();
  });

  it("does not fire when isTrackingEnabled is true but isTrackerReady is false", () => {
    setup({
      trackingEnabled: true,
      sdkTrackerReady: false,
      componentName: "StaticDashboard",
      entityId: uniqueId(),
      properties: STUB_DASHBOARD_PROPS,
    });

    expect(mockTrackSdkEvent).not.toHaveBeenCalled();
  });

  it("deduplicates — re-renders with same key do not re-fire", () => {
    const entityId = uniqueId();

    const { rerender } = setup({
      componentName: "InteractiveDashboard",
      entityId,
      properties: STUB_DASHBOARD_PROPS,
    });
    rerender();
    rerender();

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(1);
  });

  it("deduplicates across separate hook instances with same presence key", () => {
    const { state } = setupSdkState({
      settingValues: createMockSettings({ "anon-tracking-enabled": true }),
      sdkState: createMockSdkState({ sdkTrackerReady: true }),
    });
    const renderOptions = {
      storeInitialState: state,
      customReducers: sdkReducers,
    };

    // First mount fires.
    renderHookWithProviders(
      () => useTrackSdkComponentMount("CollectionBrowser", null, {}),
      renderOptions,
    );
    // Second mount — same dedup key (CollectionBrowser:presence), already fired.
    renderHookWithProviders(
      () => useTrackSdkComponentMount("CollectionBrowser", null, {}),
      renderOptions,
    );

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(1);
  });

  it("fires separate events for different entity IDs", () => {
    const idA = uniqueId();
    const idB = uniqueId();
    const { state } = setupSdkState({
      settingValues: createMockSettings({ "anon-tracking-enabled": true }),
      sdkState: createMockSdkState({ sdkTrackerReady: true }),
    });
    const renderOptions = {
      storeInitialState: state,
      customReducers: sdkReducers,
    };

    renderHookWithProviders(
      () =>
        useTrackSdkComponentMount("StaticDashboard", idA, STUB_DASHBOARD_PROPS),
      renderOptions,
    );
    renderHookWithProviders(
      () =>
        useTrackSdkComponentMount("StaticDashboard", idB, STUB_DASHBOARD_PROPS),
      renderOptions,
    );

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(2);
  });

  it("uses the correct component name in the emitted event", () => {
    setup({ componentName: "MetabotQuestion", properties: { layout: "auto" } });

    expect(mockTrackSdkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ component: "MetabotQuestion" }),
      }),
    );
  });

  it("fires a presence event for CreateDashboardModal", () => {
    setup({ componentName: "CreateDashboardModal" });

    expect(mockTrackSdkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          component: "CreateDashboardModal",
          properties: {},
        }),
      }),
    );
  });
});
