import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";

import { ensureMetabaseProviderPropsStore } from "../lib/ensure-metabase-provider-props-store";

import { useMetabaseProviderPropsStore } from "./use-metabase-provider-props-store";

const PROPS_STORE_KEY = "METABASE_PROVIDER_PROPS_STORE" as const;

const resetWindow = () => {
  delete (window as any)[PROPS_STORE_KEY];
};

// Mirrors `MetabaseProviderInner`'s cleanup effect: deletes the store
// from `window` on unmount. Under StrictMode this fires during the
// simulated unmount/remount cycle.
const ParentWithCleanup = ({ children }: { children: React.ReactNode }) => {
  useEffect(
    () => () => {
      ensureMetabaseProviderPropsStore().cleanup();
    },
    [],
  );
  return <>{children}</>;
};

const Consumer = () => {
  const { state } = useMetabaseProviderPropsStore();
  return (
    <div data-testid="instance-url">
      {state.props?.authConfig?.metabaseInstanceUrl ?? "none"}
    </div>
  );
};

describe("useMetabaseProviderPropsStore", () => {
  beforeEach(resetWindow);
  afterEach(resetWindow);

  it("re-subscribes to the new store after the StrictMode cleanup cycle wipes the previous one", () => {
    render(
      <StrictMode>
        <ParentWithCleanup>
          <Consumer />
        </ParentWithCleanup>
      </StrictMode>,
    );

    // Strict mode just ran setup → cleanup (which deleted win[KEY]) → setup.
    // The hook should now be subscribed to the freshly-created window store.
    expect(screen.getByTestId("instance-url")).toHaveTextContent("none");

    act(() => {
      ensureMetabaseProviderPropsStore().setProps({
        authConfig: { metabaseInstanceUrl: "https://example.com" } as any,
      });
    });

    expect(screen.getByTestId("instance-url")).toHaveTextContent(
      "https://example.com",
    );
  });

  it("keeps observing updates when the provider unmounts and remounts while the consumer stays mounted", () => {
    // Reproduces EMB-1684: a consumer of `useMetabaseAuthStatus`/`useMetabaseProviderPropsStore`
    // that outlives a `<MetabaseProvider>` mount cycle previously got orphaned
    // on the wiped store and never saw updates from the next mount.
    const App = () => {
      const [showProvider, setShowProvider] = useState(true);
      return (
        <>
          <Consumer />
          {showProvider && <ParentWithCleanup>{null}</ParentWithCleanup>}
          <button
            type="button"
            data-testid="toggle"
            onClick={() => setShowProvider((v) => !v)}
          >
            toggle
          </button>
        </>
      );
    };

    render(<App />);

    act(() => {
      ensureMetabaseProviderPropsStore().setProps({
        authConfig: { metabaseInstanceUrl: "https://before.com" } as any,
      });
    });
    expect(screen.getByTestId("instance-url")).toHaveTextContent(
      "https://before.com",
    );

    // Unmount the provider — its cleanup wipes the props store while the
    // Consumer is still mounted.
    fireEvent.click(screen.getByTestId("toggle"));

    // Remount the provider.
    fireEvent.click(screen.getByTestId("toggle"));

    act(() => {
      ensureMetabaseProviderPropsStore().setProps({
        authConfig: { metabaseInstanceUrl: "https://after.com" } as any,
      });
    });

    expect(screen.getByTestId("instance-url")).toHaveTextContent(
      "https://after.com",
    );
  });
});
