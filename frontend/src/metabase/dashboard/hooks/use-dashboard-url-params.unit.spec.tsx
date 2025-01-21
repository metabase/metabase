import { renderHook } from "@testing-library/react";
import type { Location } from "history";
import type { PropsWithChildren } from "react";

import { MetabaseReduxProvider } from "metabase/lib/redux";
import { useSetEmbedFont } from "metabase/public/hooks";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { createMockState } from "metabase-types/store/mocks";

import { useDashboardUrlParams } from "./use-dashboard-url-params";

jest.mock("../../public/hooks/use-set-embed-font", () => ({
  useSetEmbedFont: jest.fn(),
}));

const setup = ({ location }: { location: Location }) => {
  const store = getStore(mainReducers, undefined, createMockState());

  const Wrapper = ({ children }: PropsWithChildren) => (
    <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
  );

  const useSetEmbedFontMock = useSetEmbedFont as jest.Mock;

  const { result } = renderHook(
    () => useDashboardUrlParams({ location, onRefresh: jest.fn() }),
    {
      wrapper: Wrapper,
    },
  );

  return { result, useSetEmbedFontMock };
};

describe("useDashboardUrlParams", () => {
  it("sets embed font", () => {
    const location = { hash: "#font=Roboto" } as Location;
    const { useSetEmbedFontMock } = setup({ location });

    expect(useSetEmbedFontMock).toHaveBeenCalledWith({ location });
  });
});
