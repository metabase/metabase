import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";

import type { SdkStoreState } from "embedding-sdk-bundle/store/types";

import { ensureMetabaseProviderPropsStore } from "../lib/ensure-metabase-provider-props-store";

import { useLazySelector } from "./use-lazy-selector";

const PROPS_STORE_KEY = "METABASE_PROVIDER_PROPS_STORE" as const;

type FakeState = { sdk: { initStatus: { status: string } } };

const makeStore = (initialStatus: string) => {
  // Minimal store shim matching the redux API that useLazySelector consumes.
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

const getStatus = (state: SdkStoreState) =>
  (state as unknown as FakeState).sdk?.initStatus?.status ?? null;

const Consumer = () => {
  const status = useLazySelector(getStatus);
  return <div data-testid="status">{status === null ? "NULL" : status}</div>;
};

const Provider = ({ status }: { status: string }) => {
  // Stand-in for MetabaseProviderInner: install a redux store in the props
  // store on mount, run the props-store cleanup on unmount.
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
  beforeEach(() => {
    delete (window as any)[PROPS_STORE_KEY];
  });
  afterEach(() => {
    delete (window as any)[PROPS_STORE_KEY];
  });

  it("reflects the new redux store after the provider unmounts and remounts", async () => {
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

    expect(await screen.findByText("success")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("remount"));

    expect(await screen.findByText("error")).toBeInTheDocument();
  });

  it("works under React.StrictMode (mount → cleanup → mount cycle on first render)", async () => {
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

    // Now flip the status; the Provider's useEffect re-runs with the new
    // status, installing a new redux store. The Consumer should pick it up.
    fireEvent.click(screen.getByTestId("set-error"));

    expect(await screen.findByText("error")).toBeInTheDocument();
  });
});
