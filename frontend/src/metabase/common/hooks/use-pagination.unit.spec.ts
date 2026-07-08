import { act, renderHook } from "@testing-library/react";

import { usePagination } from "./use-pagination";

describe("usePagination", () => {
  it("should set 'page' to 'initialPage' upon calling 'resetPage'", () => {
    const initialPage = 3;
    const { result } = renderHook(() => usePagination(initialPage));

    act(() => result.current.handleNextPage());
    expect(result.current.page).toEqual(initialPage + 1);

    act(() => result.current.resetPage());
    expect(result.current.page).toEqual(initialPage);
  });

  // Defensive floor guard: the UI normally disables "Previous" on page 0, but
  // fast/automated interactions can fire a click before the disabled state
  // lands, which previously sent offset=-pageSize to the backend. See DEV-1835.
  it("should not decrement 'page' below 0 when 'handlePreviousPage' is called on page 0", () => {
    const { result } = renderHook(() => usePagination());

    expect(result.current.page).toEqual(0);

    act(() => result.current.handlePreviousPage());
    expect(result.current.page).toEqual(0);

    act(() => result.current.handlePreviousPage());
    expect(result.current.page).toEqual(0);
  });
});
