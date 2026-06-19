// Integration test: verifies that newTracker (called synchronously during parent
// render) is registered before any child useEffect fires a tracking event.
//
// React runs child effects before parent effects. The fix in tracker.ts calls
// initSdkTracker synchronously during render so the "sdk" tracker exists before
// any descendant component effect tries to send to it. This file guards against
// regression: if initSdkTracker is moved back into a useEffect, this test fails.

jest.mock("@snowplow/browser-tracker", () => ({
  newTracker: jest.fn(),
  trackSelfDescribingEvent: jest.fn(),
}));

jest.mock("metabase/embedding-sdk/config", () => ({
  isEmbeddingSdk: jest.fn().mockReturnValue(true),
  isEmbeddingEajs: jest.fn().mockReturnValue(false),
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG: { isSimpleEmbedding: false },
}));

jest.mock("metabase/utils/metaplow", () => ({
  trackMetaplowEvent: jest.fn(),
}));

jest.mock("embedding-sdk-shared/lib/get-build-info", () => ({
  getSdkPackageVersion: jest.fn(() => "0.0.0"),
}));

import {
  newTracker,
  trackSelfDescribingEvent,
} from "@snowplow/browser-tracker";

import { renderWithProviders } from "__support__/ui";
import { sdkReducers } from "embedding-sdk-bundle/store";
import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { createMockSettings } from "metabase-types/api/mocks";

import { useTrackSdkComponentMount } from "./component-events";
import { __resetTrackerForTesting } from "./snowplow";
import { __resetBeaconForTesting, useInitSdkTracker } from "./tracker";

const AUTH_CONFIG: MetabaseAuthConfig = {
  metabaseInstanceUrl: "https://metabase.example.com",
  fetchRequestToken: jest.fn(),
};

// Simulates the ComponentProvider + a child SDK component mounted beneath it.
function ProviderRoot() {
  useInitSdkTracker(AUTH_CONFIG, false);
  return <ChildComponent />;
}

function ChildComponent() {
  useTrackSdkComponentMount("StaticDashboard", null, {});
  return null;
}

describe("analytics tracker + component event ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetBeaconForTesting();
    __resetTrackerForTesting();
  });

  it("newTracker is registered before the first component-rendered event fires", () => {
    const { state } = setupSdkState({
      settingValues: createMockSettings({ "anon-tracking-enabled": true }),
      sdkState: createMockSdkState(),
    });

    renderWithProviders(<ProviderRoot />, {
      storeInitialState: state,
      customReducers: sdkReducers,
    });

    const mockNewTracker = jest.mocked(newTracker);
    const mockTrackSelfDescribingEvent = jest.mocked(trackSelfDescribingEvent);

    // Tracker must have been registered during render.
    expect(mockNewTracker).toHaveBeenCalledTimes(1);

    // Child component effect must have sent at least one event (component-rendered).
    expect(
      mockTrackSelfDescribingEvent.mock.calls.length,
    ).toBeGreaterThanOrEqual(1);

    // The registration (synchronous render) must precede the first event (child effect).
    const trackerRegisteredAt = mockNewTracker.mock.invocationCallOrder[0];
    const firstEventSentAt =
      mockTrackSelfDescribingEvent.mock.invocationCallOrder[0];
    expect(trackerRegisteredAt).toBeLessThan(firstEventSentAt);
  });
});
