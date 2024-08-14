import { renderHook, act } from "@testing-library/react-hooks";

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
});
