import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import { mainReducers } from "__support__/entities-store";
import { createMockState } from "__support__/state";
import { MetabaseReduxProvider } from "metabase/redux";
import type { EmbedState } from "metabase/redux/store";
import type { Location } from "metabase/router";
import { getStore } from "metabase/store";

import { useSetEmbedFont } from "./use-set-embed-font";

const setup = ({ location }: { location: Location }) => {
  const store = getStore(mainReducers, createMockState());

  const Wrapper = ({ children }: PropsWithChildren) => (
    <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
  );

  const { result, rerender } = renderHook((props) => useSetEmbedFont(props), {
    wrapper: Wrapper,
    initialProps: { location },
  });

  const getEmbedOptionsState = () =>
    // Unjustified type cast. FIXME
    (store.getState().embed as EmbedState).options;

  return { result, rerender, getEmbedOptionsState };
};

describe("useSetEmbedFont", () => {
  it("sets and updates font", () => {
    const { rerender, getEmbedOptionsState } = setup({
      // Unjustified type cast. FIXME
      location: { hash: "#font=Roboto" } as Location,
    });

    expect(getEmbedOptionsState().font).toBe("Roboto");

    rerender({
      // Unjustified type cast. FIXME
      location: { hash: "" } as Location,
    });

    expect(getEmbedOptionsState().font).toBe(undefined);
  });
});
