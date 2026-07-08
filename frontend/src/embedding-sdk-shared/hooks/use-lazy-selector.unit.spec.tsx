/**
 * Regression tests for EMB-1684 covering the `useLazySelector` layer of the
 * Embedding SDK hook chain.
 *
 * `useMetabaseAuthStatus` (and every other public hook in `embedding-sdk-package`)
 * is implemented on top of `useLazySelector`. `useLazySelector` itself reads
 * the current redux store from the "props store" singleton on
 * `window.METABASE_PROVIDER_PROPS_STORE`, then subscribes to that redux store
 * via `useSyncExternalStore`. When `<MetabaseProvider>` unmounts, it calls
 * `cleanup()` on the props store; if that cleanup orphans the consumer's
 * subscription, the hook gets stuck on a stale value and never picks up
 * updates from the next mount.
 *
 * These tests build a minimal stand-in for `<MetabaseProvider>` (which avoids
 * pulling in the real SDK bundle loading machinery) so we can exercise the
 * exact unmount → cleanup → remount sequence that triggers the bug.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";

import type { SdkStoreState } from "embedding-sdk-bundle/store/types";

import { ensureMetabaseProviderPropsStore } from "../lib/ensure-metabase-provider-props-store";

import { useLazySelector } from "./use-lazy-selector";

/**
 * The window key that the SDK's props store is keyed under. We delete it
 * before and after each test to guarantee a clean singleton — otherwise state
 * from one test would leak into the next via `window`.
 */
const PROPS_STORE_KEY = "METABASE_PROVIDER_PROPS_STORE" as const;

/**
 * Shape of the slice we care about from the real SDK redux state.
 * `useMetabaseAuthStatus` reads `state.sdk.initStatus` — we mirror just
 * enough of that shape (using a `status: string` instead of the real status
 * union) to drive the selector.
 */
type FakeState = { sdk: { initStatus: { status: string } } };

/**
 * Build a minimal object that quacks like a redux store for our purposes:
 * `getState` + `subscribe`. We don't need `dispatch` because none of the
 * tests dispatch actions — each test installs a brand-new store with a fixed
 * initial state and then swaps it for another store with a different fixed
 * state via the Provider re-running its effect.
 *
 * This shim sidesteps the full `configureStore` / sdk reducers wiring; we
 * only need the *subscription* surface that `useLazySelector` consumes.
 */
const makeStore = (initialStatus: string) => {
  const state: FakeState = { sdk: { initStatus: { status: initialStatus } } };
  const subs = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (cb: () => void) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
};

/**
 * The selector under test — mirrors what `useMetabaseAuthStatus` does:
 * pluck `state.sdk.initStatus.status` out of redux state. Returns `null`
 * when the slice is missing so we can distinguish "no store yet" from
 * "store with a real status".
 */
const getStatus = (state: SdkStoreState) =>
  (state as unknown as FakeState).sdk?.initStatus?.status ?? null;

/**
 * The component whose subscription we want to keep alive across provider
 * remounts. In real apps this is whichever component calls
 * `useMetabaseAuthStatus` — placed *above* or *as a sibling of*
 * `<MetabaseProvider>` so it outlives a provider unmount cycle.
 *
 * Renders `"NULL"` when the hook returns `null` so the test can assert on
 * that transition explicitly.
 */
const Consumer = () => {
  const status = useLazySelector(getStatus);
  return <div data-testid="status">{status === null ? "NULL" : status}</div>;
};

/**
 * Stand-in for the real `MetabaseProviderInner` component. The only thing we
 * borrow from the real provider is its effect contract:
 *   - on mount: install a redux store into the props store
 *   - on unmount: call `cleanup()` on the props store
 *
 * Because the `status` prop is in the effect's deps, changing it triggers
 * unmount-and-remount of the effect — which mirrors what happens in user
 * code when `<MetabaseProvider>` is conditionally rendered or its
 * `authConfig` changes between mounts.
 */
const Provider = ({ status }: { status: string }) => {
  useEffect(() => {
    const store = makeStore(status);
    ensureMetabaseProviderPropsStore().updateInternalProps({
      reduxStore: store as any,
    });
    return () => {
      ensureMetabaseProviderPropsStore().cleanup();
    };
  }, [status]);
  return null;
};

describe("useLazySelector — provider remount with stale consumer", () => {
  // Clear the window-scoped singleton so each test starts from scratch.
  beforeEach(() => {
    delete (window as any)[PROPS_STORE_KEY];
  });
  afterEach(() => {
    delete (window as any)[PROPS_STORE_KEY];
  });

  it("reflects the new redux store after the provider unmounts and remounts", async () => {
    // App scenario: <Consumer> is rendered as a sibling of <Provider>.
    // Clicking "remount" toggles the provider off and back on with a
    // *different* status, simulating the user-reported "remount with bad
    // config" repro from EMB-1684. <Consumer> stays mounted throughout, so
    // its `useSyncExternalStore` subscription must survive the cleanup.
    const App = () => {
      const [show, setShow] = useState(true);
      const [status, setStatus] = useState("success");
      return (
        <>
          <Consumer />
          <button
            data-testid="remount"
            type="button"
            onClick={() => {
              setShow(false);
              // Defer the remount to the next tick so React commits the
              // unmount (and runs the props-store cleanup) before the new
              // mount installs a fresh store.
              setTimeout(() => {
                setStatus("error");
                setShow(true);
              }, 0);
            }}
          >
            remount
          </button>
          {show && <Provider status={status} />}
        </>
      );
    };

    render(<App />);

    // Initial mount: Provider installs a store with status "success".
    expect(await screen.findByText("success")).toBeInTheDocument();

    // Unmount → cleanup → remount with status "error".
    fireEvent.click(screen.getByTestId("remount"));

    // Without the EMB-1684 fix, Consumer stays stuck on "success" because
    // its subscription was orphaned on the wiped store.
    expect(await screen.findByText("error")).toBeInTheDocument();
  });

  it("works under React.StrictMode (mount → cleanup → mount cycle on first render)", async () => {
    // React.StrictMode synthetically runs mount → unmount → mount on every
    // effect during development. That means the props store's cleanup fires
    // mid-mount on the very first render, before any real unmount happens.
    // This test makes sure the fix survives that simulated cycle too.
    const App = () => {
      const [status, setStatus] = useState("success");
      return (
        <>
          <Consumer />
          <button
            data-testid="set-error"
            type="button"
            onClick={() => setStatus("error")}
          >
            set
          </button>
          <Provider status={status} />
        </>
      );
    };

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByText("success")).toBeInTheDocument();

    // Flip the status; Provider's useEffect re-runs with the new status,
    // tearing down the old store (running cleanup) and installing a fresh
    // one. Consumer must follow the swap.
    fireEvent.click(screen.getByTestId("set-error"));

    expect(await screen.findByText("error")).toBeInTheDocument();
  });
});
