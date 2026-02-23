import { renderHook } from "@testing-library/react";
import { useBlocker, useLocation } from "react-router-dom";

import { useBlockNavigation } from "./useBlockNavigation";

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useBlocker: jest.fn(),
    useLocation: jest.fn(),
  };
});

const useBlockerMock = jest.mocked(useBlocker);
const useLocationMock = jest.mocked(useLocation);

describe("useBlockNavigation", () => {
  it("returns blocked state and delegates proceed/cancel to blocker", () => {
    const proceed = jest.fn();
    const reset = jest.fn();

    useLocationMock.mockReturnValue({
      pathname: "/current",
      search: "",
      hash: "",
      state: null,
      key: "current",
    });
    useBlockerMock.mockReturnValue({
      state: "blocked",
      location: { pathname: "/next", search: "", hash: "", state: null },
      proceed,
      reset,
    } as never);

    const { result } = renderHook(() =>
      useBlockNavigation({
        isEnabled: true,
      }),
    );

    expect(result.current.isBlocked).toBe(true);
    expect(result.current.nextLocation?.pathname).toBe("/next");

    result.current.proceed();
    result.current.cancel();

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
