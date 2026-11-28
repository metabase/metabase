import { type RefObject, useLayoutEffect, useState } from "react";

/**
 * PROTOTYPE: how far into `containerRef` a page element's text starts, so a
 * bar above the page can start its content in line with, say, the page's
 * title. Remeasures as the page renders, resizes, or reflows; `undefined`
 * until the element exists. Never less than `minInsetPx`.
 */
export function useAlignedInset(
  containerRef: RefObject<HTMLElement | null>,
  selector: string | undefined,
  minInsetPx: number,
): number | undefined {
  const [inset, setInset] = useState<number>();

  useLayoutEffect(() => {
    if (!selector) {
      setInset(undefined);
      return;
    }

    const measure = () => {
      const container = containerRef.current;
      const target = document.querySelector(selector);
      if (!container || !(target instanceof HTMLElement)) {
        setInset(undefined);
        return;
      }
      // Line up with the text, not the element's box: skip its padding and
      // border (editable titles have both).
      const style = window.getComputedStyle(target);
      const textLeft =
        target.getBoundingClientRect().left +
        parseFloat(style.paddingLeft) +
        parseFloat(style.borderLeftWidth);
      const offset = textLeft - container.getBoundingClientRect().left;
      setInset(Math.max(Math.round(offset), minInsetPx));
    };

    // The page renders (and loads) after the bar, and its layout shifts with
    // sidebars and resizing, so remeasure on the next frame after changes.
    let frame = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(document.body);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [containerRef, selector, minInsetPx]);

  return inset;
}
