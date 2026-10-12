jest.mock("embedding-sdk-bundle/analytics/component-events", () => ({
  ...jest.requireActual("embedding-sdk-bundle/analytics/component-events"),
  useIsTrackingEnabled: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/analytics/snowplow", () => ({
  initSdkTracker: jest.fn(),
  trackSdkSimpleEvent: jest.fn(),
  getSdkAuthMethod: jest.fn(),
  getSdkLocaleUsed: jest.fn(),
  getHostReactVersion: jest.fn(() => "18.3.1"),
  getSdkClient: jest.fn(() => "embedding-sdk-react"),
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getSdkPackageVersion: jest.fn(() => "1.2.3"),
}));

import { reset } from "@metabase/track";
import { renderHook } from "@testing-library/react";

import { createMockState, seedApiQueryCache } from "__support__/state";
import { useIsTrackingEnabled } from "embedding-sdk-bundle/analytics/component-events";
import {
  initSdkTracker,
  trackSdkSimpleEvent,
} from "embedding-sdk-bundle/analytics/snowplow";
import { setSdkTrackerReady } from "embedding-sdk-bundle/store/reducer";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import { trackMetaplowEvent } from "metabase/utils/metaplow";
import Settings from "metabase/utils/settings";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { deriveAuthMethod, useInitSdkTracker } from "./tracker";

const mockUseIsTrackingEnabled = jest.mocked(useIsTrackingEnabled);
const mockInitSdkTracker = jest.mocked(initSdkTracker);
const mockTrackSdkSimpleEvent = jest.mocked(trackSdkSimpleEvent);

// Mirrors the store shape snowplow.unit.spec.ts builds: settings come from the seeded
// `getSessionProperties` query cache, which is where `getSettings` reads them.
function makeStore(settings: Partial<EnterpriseSettings> = {}) {
  const state = createMockState({ sdk: createMockSdkState() });
  const stateWithSettings = {
    ...state,
    "metabase-api": seedApiQueryCache(state["metabase-api"], [
      {
        endpointName: "getSessionProperties",
        value: createMockSettings(settings),
      },
    ]),
  };
  // The hook only ever dispatches and reads state; a full store would pull in the whole SDK reducer tree.
  return {
    dispatch: jest.fn(),
    getState: () => stateWithSettings,
  } as unknown as SdkStore;
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

  it("fires embedding_sdk_initialized beacon only on first initialization", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);
    mockInitSdkTracker.mockReturnValue(true);
    const store = makeStore();

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, store, false));

    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSdkSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "embedding_sdk_initialized" }),
    );
  });

  it("does not fire the init beacon when tracker was already initialized", () => {
    mockUseIsTrackingEnabled.mockReturnValue(true);
    mockInitSdkTracker.mockReturnValue(false);
    const store = makeStore();

    renderHook(() => useInitSdkTracker(SSO_AUTH_CONFIG, store, false));

    expect(mockTrackSdkSimpleEvent).not.toHaveBeenCalled();
  });
});

describe("Metabase Track host URL", () => {
  const COLLECTOR_URL = "https://collector.example.com/api/send";
  const RELAY_SEND_URL = "https://metabase.example.com/api/metaplow-proxy/send";
  const trackingOn = { "metaplow-tracking-enabled": true };

  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsTrackingEnabled.mockReturnValue(true);
    mockInitSdkTracker.mockReturnValue(true);
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    Settings.set("metaplow-url", null);
    reset();
  });

  const getRequestedUrl = () => {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    return fetchSpy.mock.calls[0][0];
  };

  it("posts through the instance relay instead of the collector", async () => {
    Settings.set("metaplow-url", COLLECTOR_URL);
    renderHook(() =>
      useInitSdkTracker(SSO_AUTH_CONFIG, makeStore(trackingOn), false),
    );

    await trackMetaplowEvent("button_clicked");

    expect(getRequestedUrl()).toBe(RELAY_SEND_URL);
  });

  it("routes through the relay on every instance, Cloud included", async () => {
    renderHook(() =>
      useInitSdkTracker(SSO_AUTH_CONFIG, makeStore(trackingOn), false),
    );

    await trackMetaplowEvent("button_clicked");

    expect(getRequestedUrl()).toBe(RELAY_SEND_URL);
  });

  it("does not double the separator when the instance URL has a trailing slash", async () => {
    renderHook(() =>
      useInitSdkTracker(
        {
          ...SSO_AUTH_CONFIG,
          metabaseInstanceUrl: "https://metabase.example.com/",
        },
        makeStore(trackingOn),
        false,
      ),
    );

    await trackMetaplowEvent("button_clicked");

    expect(getRequestedUrl()).toBe(RELAY_SEND_URL);
  });

  it("does not initialize the tracker when the instance has Metabase Track off", async () => {
    renderHook(() =>
      useInitSdkTracker(
        SSO_AUTH_CONFIG,
        makeStore({ "metaplow-tracking-enabled": false }),
        false,
      ),
    );

    await trackMetaplowEvent("button_clicked");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
