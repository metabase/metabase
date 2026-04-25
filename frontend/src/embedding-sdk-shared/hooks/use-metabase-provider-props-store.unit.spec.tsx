import { act, render, screen } from "@testing-library/react";
import { StrictMode, useEffect } from "react";

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

describe("useMetabaseProviderPropsStore under StrictMode", () => {
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
});
