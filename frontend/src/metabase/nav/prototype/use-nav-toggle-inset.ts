import { type RefObject, useLayoutEffect, useRef, useState } from "react";

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
 * What to line up with the open-sidebar button's icon: the first of these
 * found in the container. A text element lines its text up with the icon's
 * outline; an icon (an `svg`) lines its box up with the toggle icon's box, so
 * two icons drawn on the same 16px grid match.
 */
export type NavToggleAlignTarget = { selector: string; kind: "text" | "icon" };

/**
 * PROTOTYPE: like `useNavToggleInset`, but measured: the left padding
 * `containerRef` needs for the first target found inside it to start exactly
 * where the open-sidebar button's icon does. For titles nested in wrappers
 * whose own offsets would otherwise have to be guessed.
 */
export function useNavToggleAlignedPadding(
  containerRef: RefObject<HTMLElement | null>,
  targets: NavToggleAlignTarget[],
): number | undefined {
  const isEnabled = useIsNavToggleAligned();
  const [padding, setPadding] = useState<number>();
  // The effect reads the latest targets, and reruns only when they change in
  // content, whatever array the caller passes.
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const targetsKey = JSON.stringify(targets);

  useLayoutEffect(() => {
    if (!isEnabled) {
      setPadding(undefined);
      return;
    }
    const parsedTargets = targetsRef.current;

    const measure = () => {
      const container = containerRef.current;
      const icon = document.querySelector(NAV_TOGGLE_ICON_SELECTOR);
      if (!container || !(icon instanceof SVGElement)) {
        return;
      }
      const found = parsedTargets
        .map(({ selector, kind }) => ({
          element: container.querySelector(selector),
          kind,
        }))
        .find(({ element }) => element instanceof Element);
      if (!found || !(found.element instanceof Element)) {
        return;
      }
      const containerLeft = container.getBoundingClientRect().left;
      const containerPadding = parseFloat(
        window.getComputedStyle(container).paddingLeft,
      );
      const targetRect = found.element.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      let targetLeft = targetRect.left;
      let anchorLeft = iconRect.left;
      if (found.kind === "text") {
        const targetStyle = window.getComputedStyle(found.element);
        targetLeft +=
          parseFloat(targetStyle.paddingLeft) +
          parseFloat(targetStyle.borderLeftWidth);
        anchorLeft += iconRect.width * NAV_TOGGLE_GLYPH_OFFSET_RATIO;
      }
      // How far the target sits from the container's padding edge: fixed by
      // the wrappers in between, whatever the padding is.
      const targetOffset = targetLeft - (containerLeft + containerPadding);
      setPadding(Math.round(anchorLeft - containerLeft - targetOffset));
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
  }, [isEnabled, containerRef, targetsKey]);

  return isEnabled ? padding : undefined;
}
