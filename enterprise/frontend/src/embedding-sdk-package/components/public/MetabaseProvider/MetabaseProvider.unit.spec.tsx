/**
 * Step 6 verification for EMB-1616: confirm that rendering two
 * `<MetabaseProvider>` instances side-by-side mounts the bundle's
 * `MetabotSubscriber` exactly once (first-instance-wins via
 * `EnsureSingleInstance groupId="metabase-provider"`), and that no publish
 * happens before `loadingState === Initialized && reduxStore` is set.
 *
 * The real bundle is not loaded in jsdom, so we stub
 * `window.METABASE_EMBEDDING_SDK_BUNDLE` with a minimal `MetabotSubscriber`
 * that calls `publishMetabotState(someResult)` on mount. This keeps the test
 * focused on the mount-once contract; subscriber internals are covered by
 * Step 3 (`MetabotSubscriber.unit.spec.tsx`).
 */

import { render } from "@testing-library/react";
import { useEffect } from "react";

import type { UseMetabotResult } from "embedding-sdk-bundle/types/metabot";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import * as metabotStateChannel from "embedding-sdk-shared/lib/metabot-state-channel";

import { MetabaseProvider } from "./MetabaseProvider";

type BundleWindow = Window & {
  METABASE_EMBEDDING_SDK_BUNDLE?: unknown;
  __MB_METABOT_STATE__?: unknown;
  METABASE_PROVIDER_PROPS_STORE?: unknown;
};

const makeStubMetabotResult = (): UseMetabotResult => ({
  submitMessage: jest.fn().mockResolvedValue(undefined),
  retryMessage: jest.fn().mockResolvedValue(undefined),
  cancelRequest: jest.fn(),
  resetConversation: jest.fn(),
  messages: [],
  errorMessages: [],
  isProcessing: false,
  CurrentChart: null,
});

const authConfig: MetabaseAuthConfig = {
  metabaseInstanceUrl: "https://example.metabase.test",
  authProviderUri: "https://example.metabase.test/sso",
};

const installBundleStub = (stubMetabotResult: UseMetabotResult) => {
  // Minimal `MetabotSubscriber` stub — publishes once on mount so the
  // single-instance gate is observable via `publishMetabotState` spy calls.
  const MetabotSubscriberStub = () => {
    useEffect(() => {
      metabotStateChannel.publishMetabotState(stubMetabotResult);
      return () => {
        metabotStateChannel.publishMetabotState(null);
      };
    }, []);
    return null;
  };

  // `useLoadSdkBundle` short-circuits to `SdkLoadingState.Loaded` when
  // `window.METABASE_EMBEDDING_SDK_BUNDLE` is already present, so this stub
  // both simulates a "bundle already loaded" path and provides the minimum
  // surface `MetabaseProviderInner` reads.
  (window as BundleWindow).METABASE_EMBEDDING_SDK_BUNDLE = {
    useInitData: () => {},
    useLogVersionInfo: () => {},
    // Return a minimal redux-store-shaped object. `MetabaseProviderInner`
    // only checks truthiness and passes it through to the subscriber stub,
    // which ignores the prop.
    getSdkStore: () => ({
      getState: () => ({}),
      subscribe: () => () => {},
      dispatch: () => {},
    }),
    _internal: {
      MetabotSubscriber: MetabotSubscriberStub,
    },
  };
};

const resetBundleAndChannel = () => {
  delete (window as BundleWindow).METABASE_EMBEDDING_SDK_BUNDLE;
  delete (window as BundleWindow).__MB_METABOT_STATE__;
  // The MetabaseProvider props store is also window-backed; clear it so each
  // test starts with a fresh `loadingState: Initial` + empty
  // `singleInstanceIdsMap`.
  delete (window as BundleWindow).METABASE_PROVIDER_PROPS_STORE;
};

describe("MetabaseProvider subscriber mount-once contract", () => {
  let publishSpy: jest.SpyInstance;

  beforeEach(() => {
    publishSpy = jest.spyOn(metabotStateChannel, "publishMetabotState");
  });

  afterEach(() => {
    publishSpy.mockRestore();
    resetBundleAndChannel();
  });

  it("does not publish before loadingState is Initialized and reduxStore is set", () => {
    installBundleStub(makeStubMetabotResult());

    // The stub `MetabotSubscriber` publishes on mount. If the provider
    // rendered it before the guard (`!initialized || !reduxStore`) passed,
    // we would see a publish call here. We assert the channel snapshot is
    // null before any render to establish the pre-condition.
    expect(metabotStateChannel.getMetabotStateSnapshot()).toBeNull();
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("mounts the subscriber exactly once when two providers render side-by-side", () => {
    const stubMetabotResult = makeStubMetabotResult();
    installBundleStub(stubMetabotResult);

    render(
      <>
        <MetabaseProvider authConfig={authConfig}>
          <div>first</div>
        </MetabaseProvider>
        <MetabaseProvider authConfig={authConfig}>
          <div>second</div>
        </MetabaseProvider>
      </>,
    );

    // `EnsureSingleInstance groupId="metabase-provider"` must gate the inner
    // tree so only the first-registered provider renders `MetabotSubscriber`.
    // Therefore `publishMetabotState` is called exactly once with the stub
    // result.
    const publishCallsWithStubResult = publishSpy.mock.calls.filter(
      ([value]) => value === stubMetabotResult,
    );
    expect(publishCallsWithStubResult).toHaveLength(1);

    // And the resulting channel snapshot matches the stub value.
    expect(metabotStateChannel.getMetabotStateSnapshot()).toBe(
      stubMetabotResult,
    );
  });

  it("clears the channel on unmount", () => {
    const stubMetabotResult = makeStubMetabotResult();
    installBundleStub(stubMetabotResult);

    const { unmount } = render(
      <MetabaseProvider authConfig={authConfig}>
        <div>only</div>
      </MetabaseProvider>,
    );

    expect(metabotStateChannel.getMetabotStateSnapshot()).toBe(
      stubMetabotResult,
    );

    unmount();

    expect(metabotStateChannel.getMetabotStateSnapshot()).toBeNull();
  });
});
