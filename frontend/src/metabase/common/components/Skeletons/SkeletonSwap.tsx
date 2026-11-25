import cx from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { isClassicSkeletonStyle } from "./MeasuredSkeleton";
import S from "./SkeletonSwap.module.css";

// How long the content has to go without changing to count as drawn
const SETTLE_QUIET_MS = 80;
// The longest the skeleton waits on content that keeps changing
const SETTLE_MAX_MS = 2000;
// Matches the crossfade in SkeletonSwap.module.css
const FADE_MS = 200;

/**
 * - `skeleton`: loading; only the skeleton is mounted.
 * - `settling`: loaded; the content is mounted, unseen, under the skeleton
 *   while it draws.
 * - `fading`: the content has drawn; the skeleton fades out over it.
 * - `shown`: only the content is mounted.
 */
type Phase = "skeleton" | "settling" | "fading" | "shown";

export type SkeletonSwapProps = {
  loading: boolean;
  skeleton: ReactNode;
  /** Shown instead of `skeleton` under `?skeletons=classic`, swapped at once. */
  classic?: ReactNode;
  /** For the wrapper around the skeleton and the content. */
  className?: string;
  children: ReactNode;
};

/**
 * Swaps a skeleton for its content without anything popping in. Once loaded,
 * the content is laid out and drawn unseen under the skeleton, since tables
 * and charts take a moment to measure themselves and draw, and only once it
 * stops changing does the skeleton crossfade into it. Content that's already
 * loaded when this mounts shows at once.
 */
export function SkeletonSwap({
  loading,
  skeleton,
  classic = skeleton,
  className,
  children,
}: SkeletonSwapProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(loading ? "skeleton" : "shown");

  // Follow the loading state during render, so the skeleton and the content
  // never show in the wrong phase for a frame
  if (loading && phase !== "skeleton") {
    setPhase("skeleton");
  } else if (!loading && phase === "skeleton") {
    setPhase("settling");
  }

  useEffect(() => {
    const content = contentRef.current;
    if (phase !== "settling" || !content) {
      return;
    }

    const start = performance.now();
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const waitForQuiet = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        const isTimedOut = performance.now() - start > SETTLE_MAX_MS;
        // Content whose code is still loading shows a loading view meanwhile
        const isStillLoading =
          content.querySelector('[data-testid="loading-indicator"]') != null;
        if (isStillLoading && !isTimedOut) {
          waitForQuiet();
        } else {
          setPhase("fading");
        }
      }, SETTLE_QUIET_MS);
    };

    const observer = new MutationObserver(() => {
      if (performance.now() - start < SETTLE_MAX_MS) {
        waitForQuiet();
      }
    });
    observer.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    waitForQuiet();

    return () => {
      observer.disconnect();
      clearTimeout(quietTimer);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "fading") {
      return;
    }
    const timer = setTimeout(() => setPhase("shown"), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (isClassicSkeletonStyle()) {
    return <>{loading ? classic : children}</>;
  }

  const isContentMounted = phase !== "skeleton";
  const isSkeletonMounted = phase !== "shown";

  return (
    <div className={cx(S.root, className)}>
      {isContentMounted && (
        <div
          ref={contentRef}
          className={cx(S.layer, {
            [S.unseen]: phase === "settling",
            [S.fadingIn]: phase === "fading",
          })}
        >
          {children}
        </div>
      )}
      {isSkeletonMounted && (
        <div
          className={cx(S.layer, {
            [S.overlay]: isContentMounted,
            [S.fadingOut]: phase === "fading",
          })}
        >
          {skeleton}
        </div>
      )}
    </div>
  );
}
