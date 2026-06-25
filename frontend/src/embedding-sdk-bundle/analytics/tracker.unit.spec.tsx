jest.mock("embedding-sdk-bundle/analytics/component-events", () => ({
  ...jest.requireActual("embedding-sdk-bundle/analytics/component-events"),
  useIsTrackingEnabled: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/analytics/snowplow", () => ({
  initSdkTracker: jest.fn(),
  trackSdkEvent: jest.fn(),
  getSdkAuthMethod: jest.fn(),
  getSdkLocaleUsed: jest.fn(),
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getSdkPackageVersion: jest.fn(() => "1.2.3"),
}));

import { renderHook } from "@testing-library/react";

import { useIsTrackingEnabled } from "embedding-sdk-bundle/analytics/component-events";
import {
  initSdkTracker,
  trackSdkEvent,
} from "embedding-sdk-bundle/analytics/snowplow";
import { setSdkTrackerReady } from "embedding-sdk-bundle/store/reducer";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";

import { deriveAuthMethod, useInitSdkTracker } from "./tracker";

const mockUseIsTrackingEnabled = jest.mocked(useIsTrackingEnabled);
const mockInitSdkTracker = jest.mocked(initSdkTracker);
const mockTrackSdkEvent = jest.mocked(trackSdkEvent);

function makeStore() {
  return { dispatch: jest.fn(), getState: jest.fn() } as any;
}

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
    EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding = false;
  });

  afterEach(() => {
    EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding = false;
  });

  it("does nothing in iframe embed context", () => {
    EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding = true;
    mockUseIsTrackingEnabled.mockReturnValue(true);
    const store = makeStore();

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, store, false));

    expect(mockInitSdkTracker).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when tracking is disabled", () => {
    mockUseIsTrackingEnabled.mockReturnValue(false);
    const store = makeStore();

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, store, false));

    expect(mockInitSdkTracker).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches setSdkTrackerReady(true) when tracking is enabled", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);
    mockInitSdkTracker.mockReturnValue(true);
    const store = makeStore();

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, store, false));

    expect(store.dispatch).toHaveBeenCalledWith(setSdkTrackerReady(true));
  });

  it("dispatches setSdkTrackerReady(true) even when tracker was already initialized", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);
    mockInitSdkTracker.mockReturnValue(false);
    const store = makeStore();

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, store, false));

    expect(store.dispatch).toHaveBeenCalledWith(setSdkTrackerReady(true));
  });

  it("fires the init beacon only on first initialization", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);
    mockInitSdkTracker.mockReturnValue(true);
    const store = makeStore();

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, store, false));

    expect(mockTrackSdkEvent).toHaveBeenCalledTimes(1);
  });

  it("does not fire the init beacon when tracker was already initialized", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);
    mockInitSdkTracker.mockReturnValue(false);
    const store = makeStore();

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, store, false));

    expect(mockTrackSdkEvent).not.toHaveBeenCalled();
  });
});
