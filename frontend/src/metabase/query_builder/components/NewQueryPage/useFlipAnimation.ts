import { type RefObject, useLayoutEffect, useRef } from "react";

const DEFAULT_DURATION_MS = 350;
const DEFAULT_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * FLIP-animates `ref` whenever `active` flips to true.
 * Captures the idle rect continuously, then on activation plays
 * translate/scale from the previous position to the new layout position.
 */
export function useFlipAnimation(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  {
    durationMs = DEFAULT_DURATION_MS,
    easing = DEFAULT_EASING,
    enabled = true,
  }: {
    durationMs?: number;
    easing?: string;
    enabled?: boolean;
  } = {},
) {
  const firstRectRef = useRef<DOMRect | null>(null);
  const wasActiveRef = useRef(active);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) {
      return;
    }

    if (!active) {
      firstRectRef.current = el.getBoundingClientRect();
      wasActiveRef.current = false;
      el.style.transform = "";
      el.style.transition = "";
      return;
    }

    if (wasActiveRef.current) {
      return;
    }
    wasActiveRef.current = true;

    const first = firstRectRef.current;
    firstRectRef.current = null;
    if (!first) {
      return;
    }

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / Math.max(last.width, 1);
    const sy = first.height / Math.max(last.height, 1);

    if (
      Math.abs(dx) < 1 &&
      Math.abs(dy) < 1 &&
      Math.abs(sx - 1) < 0.01 &&
      Math.abs(sy - 1) < 0.01
    ) {
      return;
    }

    el.style.transformOrigin = "top left";
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${durationMs}ms ${easing}`;
        el.style.transform = "none";
      });
    });
  }, [active, durationMs, easing, enabled, ref]);
}
