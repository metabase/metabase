// jest.mock is hoisted before imports, so jest.fn() must be defined inline.
// External const refs (like `const mockFoo = jest.fn()`) cause TDZ errors.
jest.mock("embedding-sdk-bundle/analytics/snowplow", () => ({
  trackSdkSimpleEvent: jest.fn(),
  getSdkAuthMethod: jest.fn(() => "sso"),
  getSdkLocaleUsed: jest.fn(() => false),
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getSdkPackageVersion: jest.fn(() => "1.2.3"),
}));

import { renderHookWithProviders } from "__support__/ui";
import { trackSdkSimpleEvent } from "embedding-sdk-bundle/analytics/snowplow";
import { sdkReducers } from "embedding-sdk-bundle/store";
import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { createMockSettings } from "metabase-types/api/mocks";

import type { SdkComponentName } from "./component-events";
import { useTrackSdkComponentMount } from "./component-events";

const mockTrackSdkSimpleEvent = jest.mocked(trackSdkSimpleEvent);

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
  const parseLastCallDetail = () =>
    JSON.parse(mockTrackSdkSimpleEvent.mock.lastCall?.[0].event_detail ?? "{}");

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

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "embedding_sdk_component_rendered" }),
    );
    expect(parseLastCallDetail()).toMatchObject({
      component: "StaticDashboard",
      properties: { with_title: "true" },
      global: { auth_method: "sso", sdk_version: "1.2.3", locale_used: false },
    });
  });

  it("does not fire when tracking is disabled", () => {
    setup({
      trackingEnabled: false,
      componentName: "StaticDashboard",
      entityId: uniqueId(),
      properties: STUB_DASHBOARD_PROPS,
    });

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
  });

  it("does not fire when isTrackingEnabled is true but isTrackerReady is false", () => {
    setup({
      trackingEnabled: true,
      sdkTrackerReady: false,
      componentName: "StaticDashboard",
      entityId: uniqueId(),
      properties: STUB_DASHBOARD_PROPS,
    });

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
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

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
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

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
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

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(2);
  });

  it("uses the correct component name in the emitted event", () => {
    setup({ componentName: "MetabotQuestion", properties: { layout: "auto" } });

    expect(parseLastCallDetail()).toMatchObject({
      component: "MetabotQuestion",
    });
  });

  it("fires a presence event for CreateDashboardModal", () => {
    setup({ componentName: "CreateDashboardModal" });

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "embedding_sdk_component_rendered",
      }),
    );
    expect(parseLastCallDetail()).toMatchObject({
      component: "CreateDashboardModal",
      properties: {},
    });
  });
});
