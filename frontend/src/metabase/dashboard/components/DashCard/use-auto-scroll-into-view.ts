import { type RefObject, useEffect, useRef } from "react";

/**
 * How many consecutive frames the target has to stay put, and inside the
 * viewport, before the scroll counts as done.
 */
const SETTLED_FRAME_COUNT = 3;

/**
 * Safety cap, roughly a second at 60fps, for a dashboard that never settles.
 */
const MAX_FRAME_COUNT = 60;

/**
 * Scrolls the target into view and keeps doing so until it stays put.
 *
 * Runs whenever the card becomes the target, not only when it mounts: a
 * `#scrollTo` hash added to the dashboard you are already on is a plain hash
 * change, and the dashcards around it stay mounted.
 *
 * One scroll is not enough either. The dashboard grid measures its container
 * and re-lays out its cards over the following frames, which moves every
 * dashcard, and a freshly loaded page can have its scroll position reset by the
 * browser after that. Either one leaves the target off screen.
 *
 * `onScrolled` fires with the first scroll rather than after the last one, so
 * clearing the `scrollTo` hash never waits for the layout to settle. Clearing
 * it is what makes this card stop being the target, so the loop deliberately
 * outlives `enabled` and is only cancelled on unmount.
 */
export function useAutoScrollIntoView({
  ref,
  enabled,
  onScrolled,
}: {
  ref: RefObject<HTMLElement>;
  enabled: boolean;
  onScrolled: () => void;
}) {
  const onScrolledRef = useRef(onScrolled);
  onScrolledRef.current = onScrolled;

  const frameRef = useRef<number>();

  useEffect(() => () => cancelAnimationFrame(frameRef.current ?? 0), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let frameCount = 0;
    let settledFrameCount = 0;
    let previousTop: number | null = null;

    const scrollIntoView = () => {
      const element = ref.current;
      if (!element) {
        return;
      }

      element.scrollIntoView({ block: "nearest" });

      const { top } = element.getBoundingClientRect();
      const isInViewport = top >= 0 && top < window.innerHeight;
      const hasStoppedMoving =
        previousTop !== null && Math.abs(top - previousTop) < 1;

      previousTop = top;
      settledFrameCount =
        isInViewport && hasStoppedMoving ? settledFrameCount + 1 : 0;
    };

    const scrollUntilSettled = () => {
      scrollIntoView();
      frameCount += 1;

      if (
        settledFrameCount >= SETTLED_FRAME_COUNT ||
        frameCount >= MAX_FRAME_COUNT
      ) {
        return;
      }

      frameRef.current = requestAnimationFrame(scrollUntilSettled);
    };

    scrollIntoView();
    onScrolledRef.current();
    frameRef.current = requestAnimationFrame(scrollUntilSettled);
  }, [enabled, ref]);
}
