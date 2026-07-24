import { type RefObject, useEffect, useRef } from "react";

/**
 * Long enough to cover the grid's post-measure re-layout, short enough not to
 * fight a user who starts scrolling.
 */
const CORRECTION_FRAME_COUNT = 20;

/**
 * Scrolls the target into view, then keeps it there for a moment.
 *
 * Runs whenever the card becomes the target, not only when it mounts: a
 * `#scrollTo` hash added to the dashboard you are already on is a plain hash
 * change, and the dashcards around it stay mounted.
 *
 * The repeat matters on a cold load. The dashboard grid measures its container
 * and re-lays out its cards over the following frames, which moves every
 * dashcard out from under a scroll that already happened.
 *
 * `onScrolled` fires with the first scroll rather than the last, so clearing
 * the `scrollTo` hash never waits on the layout. Clearing it is what makes this
 * card stop being the target, so the repeats deliberately outlive `enabled` and
 * are only cancelled on unmount.
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

    const scrollIntoView = () => {
      ref.current?.scrollIntoView({ block: "nearest" });

      if (++frameCount < CORRECTION_FRAME_COUNT) {
        frameRef.current = requestAnimationFrame(scrollIntoView);
      }
    };

    scrollIntoView();
    onScrolledRef.current();
  }, [enabled, ref]);
}
