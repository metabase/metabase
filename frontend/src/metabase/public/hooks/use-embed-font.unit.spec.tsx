import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import { MetabaseReduxProvider } from "metabase/lib/redux";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import type { EmbedState } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { useEmbedFont } from "./use-embed-font";

const setup = () => {
  const store = getStore(mainReducers, undefined, createMockState());

  const Wrapper = ({ children }: PropsWithChildren) => (
    <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
  );

  const { result, rerender } = renderHook(() => useEmbedFont(), {
    wrapper: Wrapper,
  });

  const getEmbedOptionsState = () =>
    (store.getState().embed as EmbedState).options;

  return { result, rerender, getEmbedOptionsState };
};

describe("useEmbedFont", () => {
  it("sets and updates font", () => {
    const { result, getEmbedOptionsState } = setup();

    act(() => {
      result.current.setFont("Roboto");
    });

    expect(getEmbedOptionsState().font).toBe("Roboto");

    act(() => {
      result.current.setFont(null);
    });

    expect(getEmbedOptionsState().font).toBe("Lato");
  });
});
