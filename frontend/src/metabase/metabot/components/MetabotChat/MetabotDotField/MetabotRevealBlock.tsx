import { type ReactNode, useLayoutEffect, useRef } from "react";

import {
  REVEAL_TIMELINES,
  type RevealContentKind,
  computeRevealFrame,
} from "./reveal-timeline";

type MetabotRevealBlockProps = {
  /** Drives the timing (charts get a draw beat, text is quicker). */
  kind: RevealContentKind;
  /**
   * Run the reveal. When false the children render immediately — used for
   * already-settled / historical messages that shouldn't re-animate.
   */
  animate?: boolean;
  /**
   * Gates the reveal until the content is ready (e.g. a chart whose query has
   * resolved). While false the content stays hidden (reserved). Defaults true.
   */
  ready?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Fades a streamed Metabot content block in over the turn's dot field. The
 * block's layout space is reserved from the first frame (content held at
 * opacity 0 so it still occupies height, letting the dots show through), then
 * the content fades in once it's `ready`. The dots themselves are painted and
 * dissolved by the single {@link MetabotTurnDotField} behind the whole turn, so
 * this component only owns the content's opacity.
 *
 * Opacity is driven imperatively (never via React-controlled style) so the
 * frequent re-renders of streaming content can't reset the reveal mid-flight.
 */
export const MetabotRevealBlock = ({
  kind,
  animate = true,
  ready = true,
  className,
  children,
}: MetabotRevealBlockProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useLayoutEffect(() => {
    if (!animate || reducedMotion) {
      return;
    }
    const setOpacity = (o: number) => {
      if (contentRef.current) {
        contentRef.current.style.opacity = `${o}`;
      }
    };
    if (doneRef.current) {
      setOpacity(1);
      return;
    }
    if (!ready) {
      setOpacity(0);
      return;
    }

    const tl = REVEAL_TIMELINES[kind];
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start == null) {
        start = ts;
      }
      const t = ts - start;
      const frame = computeRevealFrame(Math.min(t, tl.duration), tl);
      setOpacity(frame.revealProgress);
      // only need to run until the content has fully faded in
      if (t < tl.reveal[1]) {
        raf = requestAnimationFrame(tick);
      } else {
        doneRef.current = true;
        setOpacity(1);
      }
    };
    // hide synchronously (before paint) so content never flashes in early
    setOpacity(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, ready, kind, reducedMotion]);

  if (!animate || reducedMotion) {
    return <>{children}</>;
  }

  return (
    <div ref={contentRef} className={className}>
      {children}
    </div>
  );
};
