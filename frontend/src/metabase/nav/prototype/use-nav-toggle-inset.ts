import { type RefObject, useLayoutEffect, useState } from "react";

import { useSelector } from "metabase/redux";
import { getIsNavbarOpen } from "metabase/selectors/app";

import { useNavVariant } from "./use-nav-variant";

/**
 * Where the open-sidebar button's icon is drawn, from the page's left edge:
 * the button sits 16px in, its 16px icon is centered in a 32px box, and the
 * icon's outline starts 1.75px into that.
 */
const NAV_TOGGLE_ICON_INSET_PX = 26;

// The breadcrumb bar's toggle; the closed nav keeps its own toggle mounted,
// off-screen, so a bare `sidebar-toggle` lookup can find that one first.
const NAV_TOGGLE_ICON_SELECTOR = "[data-nav-toggle-anchor] svg";
// The sidebar icon's outline starts this far into its 16-unit viewBox.
const NAV_TOGGLE_GLYPH_OFFSET_RATIO = 1.75 / 16;

function useIsNavToggleAligned(): boolean {
  const { variant } = useNavVariant();
  const isNavbarOpen = useSelector(getIsNavbarOpen);
  return variant === "modern-nav-c" && !isNavbarOpen;
}

/**
 * PROTOTYPE: in "Modern nav - C" with the nav closed, the inset that lines a
 * page's content up with the open-sidebar button's icon in the bar above;
 * `undefined` otherwise, so pages keep their own padding.
 */
export function useNavToggleInset(): number | undefined {
  return useIsNavToggleAligned() ? NAV_TOGGLE_ICON_INSET_PX : undefined;
}

/**
 * PROTOTYPE: like `useNavToggleInset`, but measured: the left padding
 * `containerRef` needs for the text of the element at `selector` inside it to
 * start exactly where the open-sidebar button's icon does. For titles nested
 * in wrappers whose own offsets would otherwise have to be guessed.
 */
export function useNavToggleAlignedPadding(
  containerRef: RefObject<HTMLElement | null>,
  selector: string,
): number | undefined {
  const isEnabled = useIsNavToggleAligned();
  const [padding, setPadding] = useState<number>();

  useLayoutEffect(() => {
    if (!isEnabled) {
      setPadding(undefined);
      return;
    }

    const measure = () => {
      const container = containerRef.current;
      const target = container?.querySelector(selector);
      const icon = document.querySelector(NAV_TOGGLE_ICON_SELECTOR);
      if (
        !container ||
        !(target instanceof HTMLElement) ||
        !(icon instanceof SVGElement)
      ) {
        return;
      }
      const containerLeft = container.getBoundingClientRect().left;
      const containerPadding = parseFloat(
        window.getComputedStyle(container).paddingLeft,
      );
      const targetStyle = window.getComputedStyle(target);
      const textLeft =
        target.getBoundingClientRect().left +
        parseFloat(targetStyle.paddingLeft) +
        parseFloat(targetStyle.borderLeftWidth);
      // How far the text sits from the container's padding edge: fixed by
      // the wrappers in between, whatever the padding is.
      const textOffset = textLeft - (containerLeft + containerPadding);
      const iconRect = icon.getBoundingClientRect();
      const glyphLeft =
        iconRect.left + iconRect.width * NAV_TOGGLE_GLYPH_OFFSET_RATIO;
      setPadding(Math.round(glyphLeft - containerLeft - textOffset));
    };

    // The title renders (and loads) after the header, so remeasure on the
    // next frame after changes.
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
  }, [isEnabled, containerRef, selector]);

  return isEnabled ? padding : undefined;
}
