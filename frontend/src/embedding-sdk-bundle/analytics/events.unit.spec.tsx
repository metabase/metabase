// jest.mock is hoisted before imports, so jest.fn() must be defined inline.
// External const refs (like `const mockFoo = jest.fn()`) cause TDZ errors.
jest.mock("embedding-sdk-bundle/analytics/snowplow", () => ({
  trackSdkSimpleEvent: jest.fn(),
  // SdkAuthMethod is a type — no runtime value needed.
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

// Unique instance counter so firedKeys never causes cross-test interference.
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
  componentName: SdkComponentName;
  entityId?: number | null;
  properties?: Record<string, unknown>;
}

function setup({
  trackingEnabled = true,
  componentName,
  entityId = null,
  properties = {},
}: SetupOptions) {
  const { state } = setupSdkState({
    settingValues: createMockSettings({
      "anon-tracking-enabled": trackingEnabled,
    }),
    sdkState: createMockSdkState(),
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

  it("fires one event when tracking is enabled", () => {
    setup({
      componentName: "StaticDashboard",
      entityId: uniqueId(),
      properties: { ...STUB_DASHBOARD_PROPS, with_title: true },
    });

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "embedding_sdk_component_rendered",
        triggered_from: "StaticDashboard",
        event_detail: expect.stringContaining('"with_title":"true"'),
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

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
  });

  it("deduplicates — re-renders with the same instance key do not re-fire", () => {
    const { rerender } = setup({
      componentName: "InteractiveDashboard",
      entityId: uniqueId(),
      properties: STUB_DASHBOARD_PROPS,
    });
    rerender();
    rerender();

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
  });

  it("fires separate events for two mounts of the same component type", () => {
    const { state } = setupSdkState({
      settingValues: createMockSettings({ "anon-tracking-enabled": true }),
      sdkState: createMockSdkState(),
    });
    const renderOptions = {
      storeInitialState: state,
      customReducers: sdkReducers,
    };

    renderHookWithProviders(
      () =>
        useTrackSdkComponentMount(
          "StaticDashboard",
          uniqueId(),
          STUB_DASHBOARD_PROPS,
        ),
      renderOptions,
    );
    renderHookWithProviders(
      () =>
        useTrackSdkComponentMount(
          "StaticDashboard",
          uniqueId(),
          STUB_DASHBOARD_PROPS,
        ),
      renderOptions,
    );

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(2);
  });

  it("uses the correct component name as triggered_from", () => {
    setup({ componentName: "MetabotQuestion", properties: { layout: "auto" } });

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ triggered_from: "MetabotQuestion" }),
    );
  });

  it("fires for CreateDashboardModal with empty properties", () => {
    setup({ componentName: "CreateDashboardModal" });

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "embedding_sdk_component_rendered",
        triggered_from: "CreateDashboardModal",
      }),
    );
  });

  it("includes sdk_version in event_detail JSON", () => {
    setup({
      componentName: "StaticDashboard",
      entityId: uniqueId(),
      properties: STUB_DASHBOARD_PROPS,
    });

    const call = mockTrackSdkSimpleEvent.mock.calls[0][0];
    const detail = JSON.parse(call.event_detail!);
    expect(detail.sdk_version).toBe("1.2.3");
  });
});
