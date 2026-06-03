import { useEffect, useRef, useState } from "react";

// Smooth-streaming buffer. Model/network deltas are bursty — a whole line can
// land in one chunk, then nothing for 200ms. This hook holds the freshly-arrived
// text back and releases it one word at a time on an animation-frame cadence, so
// each word can mount-and-animate on its own instead of a whole line appearing at
// once. The release rate tracks the stream: when the buffer is far behind a fast
// model it drains several words per frame; when text trickles in it reveals a
// word as it arrives. When disabled (a finished or historical message) it passes
// the target straight through.

const scheduleFrame = (cb: () => void): number =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(cb)
    : window.setTimeout(cb, 16);

const cancelFrame = (handle: number): void => {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
  } else {
    window.clearTimeout(handle);
  }
};

// How far to advance this frame. ~one word when keeping pace; more when we've
// fallen well behind a fast stream, so the buffer never lags noticeably.
const nextRevealLength = (shown: string, target: string): number => {
  const backlog = target.length - shown.length;
  const step = Math.min(48, Math.max(4, Math.ceil(backlog / 20)));
  let next = Math.min(shown.length + step, target.length);
  // extend to the end of the current word so we never reveal a partial word
  while (next < target.length && !/\s/.test(target[next])) {
    next++;
  }
  return next;
};

export const useSmoothText = (target: string, enabled: boolean): string => {
  // When animating, start empty and reveal toward the target so the very first
  // chunk streams in word-by-word rather than dumping in as one block.
  const [shown, setShown] = useState(enabled ? "" : target);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!enabled) {
      setShown(targetRef.current);
      return;
    }

    let active = true;
    let handle = 0;

    const loop = () => {
      if (!active) {
        return;
      }
      setShown((prev) => {
        const next = targetRef.current;
        // target diverged (component reused for a different message) — restart
        const base = next.startsWith(prev) ? prev : "";
        if (base.length >= next.length) {
          return base;
        }
        return next.slice(0, nextRevealLength(base, next));
      });
      handle = scheduleFrame(loop);
    };

    handle = scheduleFrame(loop);
    return () => {
      active = false;
      cancelFrame(handle);
    };
  }, [enabled]);

  return enabled ? shown : target;
};
