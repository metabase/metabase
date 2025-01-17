import { renderHook } from "@testing-library/react";
import type { Location } from "history";
import type { PropsWithChildren } from "react";

import { MetabaseReduxProvider } from "metabase/lib/redux";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { createMockState } from "metabase-types/store/mocks";

import { useDashboardUrlParams } from "./use-dashboard-url-params";
import { useEmbedFont } from "./use-embed-font";

jest.mock("./use-embed-font", () => ({
  useEmbedFont: jest.fn(),
}));

const setup = ({ location }: { location: Location }) => {
  const store = getStore(mainReducers, undefined, createMockState());

  const Wrapper = ({ children }: PropsWithChildren) => (
    <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
  );

  const setFontMock = jest.fn();
  const onRefreshMock = jest.fn();

  (useEmbedFont as jest.Mock).mockReturnValue({
    font: null,
    setFont: setFontMock,
  });

  const { result, rerender } = renderHook(
    props => useDashboardUrlParams(props),
    {
      wrapper: Wrapper,
      initialProps: { location, onRefresh: onRefreshMock },
    },
  );

  return { result, rerender, setFontMock, onRefreshMock };
};

describe("useDashboardUrlParams", () => {
  it("sets and updates font", () => {
    const { setFontMock, onRefreshMock, rerender } = setup({
      location: { hash: "#font=Roboto" } as Location,
    });

    expect(setFontMock).toHaveBeenCalledWith("Roboto");

    rerender({
      location: { hash: "" } as Location,
      onRefresh: onRefreshMock,
    });

    expect(setFontMock).toHaveBeenCalledWith(null);
    expect(setFontMock).toHaveBeenCalledTimes(2);
  });
});
