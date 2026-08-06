import { act } from "@testing-library/react";

const FOLD = 800;

/**
 * Gives a lazily loaded tree a layout, which jsdom otherwise has none of.
 *
 * The tree decides what to read by measuring where the end of its list sits against the box it scrolls in, so a test
 * that wants to drive it has to say where that is. Call inside a `describe`: it restores the real measurements after
 * each test.
 */
export function setupTreeLayout() {
  let sentinelTop = FOLD * 2;
  let listTop = 0;

  const install = () => {
    // Reset the position too, or a test that scrolled would hand the next one a list already at its end.
    sentinelTop = FOLD * 2;
    listTop = 0;
    jest
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(FOLD);
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const top =
          this.dataset.testid === "tree-load-more"
            ? sentinelTop
            : this.tagName === "UL"
              ? listTop
              : 0;
        // Only the edges the tree reads, rather than a whole DOMRect of zeroes to no purpose.
        return { top, bottom: this === document.body ? FOLD : FOLD } as DOMRect;
      });
  };

  beforeEach(install);
  afterEach(() => jest.restoreAllMocks());

  /**
   * Scrolls so the end of the list sits `rows` rows below the top of the scroll box. Negative puts it above, which
   * is the reader having gone past it.
   */
  function scrollEndOfListTo(rows: number, scroller: Element) {
    sentinelTop = rows * 32;
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
    });
  }

  /** Scrolls into the reserved rows above a level's window, `rows` rows down from where the level starts. */
  function scrollAboveWindowTo(rows: number, scroller: Element) {
    listTop = -rows * 32;
    sentinelTop = FOLD * 4;
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
    });
  }

  /** The same walk the tree does, so a test drives the box it actually listened on. */
  function findScroller(element: Element): Element | null {
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const { overflowY } = window.getComputedStyle(parent);
      if (overflowY === "auto" || overflowY === "scroll") {
        return parent;
      }
    }
    return null;
  }

  return { scrollEndOfListTo, scrollAboveWindowTo, findScroller };
}
