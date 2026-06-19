jest.mock("embedding-sdk-bundle/analytics/snowplow", () => ({
  initSdkTracker: jest.fn(),
  trackSdkSimpleEvent: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/analytics/component-events", () => ({
  ...jest.requireActual("embedding-sdk-bundle/analytics/component-events"),
  useIsTrackingEnabled: jest.fn(),
  setSdkTrackingContext: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/store", () => ({
  useSdkStore: jest.fn(),
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getSdkPackageVersion: jest.fn(() => "1.2.3"),
}));

import { renderHook } from "@testing-library/react";

import {
  setSdkTrackingContext,
  useIsTrackingEnabled,
} from "embedding-sdk-bundle/analytics/component-events";
import {
  initSdkTracker,
  trackSdkSimpleEvent,
} from "embedding-sdk-bundle/analytics/snowplow";
import { useSdkStore } from "embedding-sdk-bundle/store";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";

import {
  __resetBeaconForTesting,
  deriveAuthMethod,
  useInitSdkTracker,
} from "./tracker";

const mockUseIsTrackingEnabled = jest.mocked(useIsTrackingEnabled);
const mockTrackSdkSimpleEvent = jest.mocked(trackSdkSimpleEvent);
const mockSetSdkTrackingContext = jest.mocked(setSdkTrackingContext);
const mockInitSdkTracker = jest.mocked(initSdkTracker);
const mockUseSdkStore = jest.mocked(useSdkStore);

const SSO_AUTH_CONFIG: MetabaseAuthConfig = {
  metabaseInstanceUrl: "https://metabase.example.com",
  fetchRequestToken: jest.fn(),
};

describe("deriveAuthMethod", () => {
  it("returns 'guest' when isGuest is true", () => {
    expect(
      deriveAuthMethod({
        metabaseInstanceUrl: "https://metabase.example.com",
        isGuest: true,
      }),
    ).toBe("guest");
  });

  it("returns 'api_key' when apiKey is present", () => {
    expect(
      deriveAuthMethod({
        metabaseInstanceUrl: "https://metabase.example.com",
        apiKey: "mb_test_key",
      }),
    ).toBe("api_key");
  });

  it("returns 'sso' for JWT/SAML auth configs", () => {
    expect(deriveAuthMethod(SSO_AUTH_CONFIG)).toBe("sso");
  });
});

describe("useInitSdkTracker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetBeaconForTesting();
    EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding = false;
    mockUseSdkStore.mockReturnValue({ getState: jest.fn() } as never);
  });

  afterEach(() => {
    EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding = false;
  });

  it("does nothing in iframe embed context", () => {
    EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding = true;
    mockUseIsTrackingEnabled.mockReturnValue(true);

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, false));

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
    expect(mockInitSdkTracker).not.toHaveBeenCalled();
  });

  it("does nothing when tracking is disabled", () => {
    mockUseIsTrackingEnabled.mockReturnValue(false);

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, false));

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
    expect(mockInitSdkTracker).not.toHaveBeenCalled();
  });

  it("sets tracking context synchronously during render", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, true));

    expect(mockSetSdkTrackingContext).toHaveBeenCalledWith("sso", true);
  });

  it("initializes the SDK Snowplow tracker with the instance URL", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, false));

    expect(mockInitSdkTracker).toHaveBeenCalledWith(
      expect.objectContaining({
        metabaseInstanceUrl: "https://metabase.example.com",
        getStoreState: expect.any(Function),
      }),
    );
  });

  it("fires embedding_sdk_initialized beacon when tracking is enabled", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, false));

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "embedding_sdk_initialized",
        event_detail: expect.stringContaining('"auth_method":"sso"'),
      }),
    );
  });

  it("includes sdk_version in the beacon event_detail", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, false));

    const call = mockTrackSdkSimpleEvent.mock.calls[0][0];
    const detail = JSON.parse(call.event_detail!);
    expect(detail.sdk_version).toBe("1.2.3");
  });
});
