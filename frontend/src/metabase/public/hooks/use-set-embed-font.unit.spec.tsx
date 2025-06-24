import { renderHook } from "@testing-library/react";
import type { Location } from "history";
import type { PropsWithChildren } from "react";

import { MetabaseReduxProvider } from "metabase/lib/redux";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import type { EmbedState } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { useSetEmbedFont } from "./use-set-embed-font";

const setup = ({ location }: { location: Location }) => {
  const store = getStore(mainReducers, undefined, createMockState());

  const Wrapper = ({ children }: PropsWithChildren) => (
    <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
  );

  const { result, rerender } = renderHook((props) => useSetEmbedFont(props), {
    wrapper: Wrapper,
    initialProps: { location },
  });

  const getEmbedOptionsState = () =>
    (store.getState().embed as EmbedState).options;

  return { result, rerender, getEmbedOptionsState };
};

describe("useSetEmbedFont", () => {
  it("sets and updates font", () => {
    const { rerender, getEmbedOptionsState } = setup({
      location: { hash: "#font=Roboto" } as Location,
    });

    expect(getEmbedOptionsState().font).toBe("Roboto");

    rerender({
      location: { hash: "" } as Location,
    });

    expect(getEmbedOptionsState().font).toBe(undefined);
  });
});
