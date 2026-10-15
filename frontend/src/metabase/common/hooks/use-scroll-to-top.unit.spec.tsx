import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";

import { useScrollToTop } from "./use-scroll-to-top";

type Props = {
  keys: unknown[];
  skip: boolean;
};

function setup(initialProps: Props) {
  const element = document.createElement("div");
  const ref: RefObject<HTMLElement> = { current: element };
  element.scrollTop = 100;

  const view = renderHook(
    ({ keys, skip }: Props) => useScrollToTop({ ref, keys, skip }),
    { initialProps },
  );

  return { ...view, element };
}

describe("useScrollToTop", () => {
  it("does not scroll on mount", () => {
    const { element } = setup({ keys: [0], skip: false });
    expect(element.scrollTop).toBe(100);
  });

  it("scrolls to top on a keys change while not skipped (cache-hit path)", () => {
    const { rerender, element } = setup({ keys: [0], skip: false });
    expect(element.scrollTop).toBe(100);

    rerender({ keys: [1], skip: false });
    expect(element.scrollTop).toBe(0);
  });

  it("defers the scroll until skip becomes false, then scrolls exactly once", () => {
    const { rerender, element } = setup({ keys: [0], skip: false });

    // Keys change while skipped (fetching): no scroll yet.
    rerender({ keys: [1], skip: true });
    expect(element.scrollTop).toBe(100);

    // Fetch finishes: scroll now.
    rerender({ keys: [1], skip: false });
    expect(element.scrollTop).toBe(0);

    // Reset the scroll position and toggle skip again: no further scroll,
    // because the pending reset was already consumed.
    element.scrollTop = 100;
    rerender({ keys: [1], skip: true });
    rerender({ keys: [1], skip: false });
    expect(element.scrollTop).toBe(100);
  });

  it("does not scroll when skip toggles with unchanged keys", () => {
    const { rerender, element } = setup({ keys: [0], skip: false });

    rerender({ keys: [0], skip: true });
    expect(element.scrollTop).toBe(100);

    rerender({ keys: [0], skip: false });
    expect(element.scrollTop).toBe(100);

    rerender({ keys: [0], skip: true });
    rerender({ keys: [0], skip: false });
    expect(element.scrollTop).toBe(100);
  });

  it("scrolls on each distinct keys change", () => {
    const { rerender, element } = setup({ keys: [0], skip: false });

    rerender({ keys: [1], skip: false });
    expect(element.scrollTop).toBe(0);

    element.scrollTop = 100;
    rerender({ keys: [2], skip: false });
    expect(element.scrollTop).toBe(0);
  });

  it("treats deeply-equal object keys as unchanged", () => {
    const { rerender, element } = setup({
      keys: [1, { sortColumn: "name", sortDirection: "asc" }],
      skip: false,
    });

    rerender({
      keys: [1, { sortColumn: "name", sortDirection: "asc" }],
      skip: false,
    });
    expect(element.scrollTop).toBe(100);

    rerender({
      keys: [1, { sortColumn: "name", sortDirection: "desc" }],
      skip: false,
    });
    expect(element.scrollTop).toBe(0);
  });

  it("distinguishes key values that serialize identically", () => {
    const { rerender, element } = setup({
      keys: [undefined],
      skip: false,
    });

    rerender({ keys: [null], skip: false });

    expect(element.scrollTop).toBe(0);
  });
});
