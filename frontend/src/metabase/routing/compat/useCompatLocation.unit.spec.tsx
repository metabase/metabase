import { renderHook } from "@testing-library/react";
import { useLocation, useSearchParams } from "react-router-dom";

import { useCompatLocation, useCompatSearchParams } from "./useCompatLocation";
import { useNavigation } from "./useNavigation";

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useLocation: jest.fn(),
    useSearchParams: jest.fn(),
  };
});

jest.mock("./useNavigation", () => ({
  useNavigation: jest.fn(),
}));

const useLocationMock = jest.mocked(useLocation);
const useSearchParamsMock = jest.mocked(useSearchParams);
const useNavigationMock = jest.mocked(useNavigation);

describe("useCompatLocation", () => {
  beforeEach(() => {
    useLocationMock.mockReturnValue({
      pathname: "/question/1",
      search: "?tab=query&mode=edit",
      hash: "",
      state: null,
      key: "question",
    });
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams("tab=query&mode=edit"),
      jest.fn(),
    ] as never);
  });

  it("exposes both query object and searchParams", () => {
    const { result } = renderHook(() => useCompatLocation());

    expect(result.current.query.tab).toBe("query");
    expect(result.current.query.mode).toBe("edit");
    expect(result.current.searchParams.get("tab")).toBe("query");
  });

  it("updates query params with replace navigation", () => {
    const replace = jest.fn();
    useNavigationMock.mockReturnValue({
      push: jest.fn(),
      replace,
      goBack: jest.fn(),
      navigate: jest.fn(),
    });

    const { result } = renderHook(() => useCompatSearchParams());
    const [, setSearchParams] = result.current;

    setSearchParams({ tab: "metadata", mode: undefined });

    expect(replace).toHaveBeenCalledWith({
      pathname: "/question/1",
      search: "?tab=metadata",
      hash: "",
    });
  });
});
