import { type RefObject, useLayoutEffect, useRef } from "react";

import {
  FILTER_LAYOUT_ANIMATION,
  usePrototypeSetting,
} from "metabase/prototype";

const DURATION_MS = 520;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";

type Layout = {
  key: string;
  height: number;
  positions: Map<Element, { x: number; y: number }>;
};

/**
 * Prototype: a FLIP animation of the bar's children when `layoutKey` changes,
 * for example when the bar changes between one line and indented rows. React
 * keeps the DOM node of each keyed child, so the node is the identity of a
 * token. New nodes, like the row breaks, show at once.
 *
 * The positions come from `offsetLeft` and `offsetTop`, which a running
 * animation does not change, so other renders during an animation do not
 * break it.
 */
export function useLayoutAnimation(
  containerRef: RefObject<HTMLElement | null>,
  layoutKey: string,
) {
  const [isEnabled] = usePrototypeSetting(FILTER_LAYOUT_ANIMATION);
  const previousRef = useRef<Layout>(undefined);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }
    const current = measure(container, layoutKey);
    const previous = previousRef.current;
    previousRef.current = current;
    if (
      previous == null ||
      previous.key === layoutKey ||
      !isEnabled ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    current.positions.forEach((position, element) => {
      const old = previous.positions.get(element);
      if (old == null) {
        return;
      }
      const dx = old.x - position.x;
      const dy = old.y - position.y;
      if (dx === 0 && dy === 0) {
        return;
      }
      element.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: DURATION_MS, easing: EASING },
      );
    });
    // A bar that grows takes its new height at once, so the tokens move into
    // room that is already there. A bar that shrinks keeps its old height
    // until the tokens are in place, then takes the new height at once. In
    // that time the wrapped lines stay at the top: by default, a flex
    // container spreads its lines over the free height.
    if (previous.height > current.height) {
      const frame = {
        height: `${previous.height}px`,
        alignContent: "flex-start",
      };
      container.animate([frame, frame], { duration: DURATION_MS });
    }
  });
}

function measure(container: HTMLElement, key: string): Layout {
  const positions = new Map<Element, { x: number; y: number }>();
  for (const element of container.children) {
    // Hidden elements have no offset parent.
    if (element instanceof HTMLElement && element.offsetParent != null) {
      positions.set(element, { x: element.offsetLeft, y: element.offsetTop });
    }
  }
  return { key, height: container.offsetHeight, positions };
}
