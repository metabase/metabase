import { useEffect, useRef, useState } from "react";

import { PREVIEW_MIN_MS } from "./constants";

// re-renders on a slow tick while the turn is live so elapsed-time thresholds
// (e.g. reasoning duration) cross even with no streaming events
export const useNow = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(id);
  }, [active]);
  return now;
};

// meters a stream of preview labels: each is held on screen for at least
// PREVIEW_MIN_MS before the next replaces it. labels that pile up during a hold
// are queued, never dropped, so each one still gets its moment.
export const useMeteredLabel = (target: string): string => {
  const [shown, setShown] = useState(target);
  const queueRef = useRef<string[]>([]);
  const lastRef = useRef(target);
  const lockedRef = useRef(false);

  useEffect(() => {
    if (target === lastRef.current) {
      return;
    }
    lastRef.current = target;
    if (lockedRef.current) {
      queueRef.current.push(target);
    } else {
      lockedRef.current = true;
      setShown(target);
    }
  }, [target]);

  useEffect(() => {
    if (!lockedRef.current) {
      return;
    }
    const id = setTimeout(() => {
      const next = queueRef.current.shift();
      if (next === undefined) {
        lockedRef.current = false;
      } else {
        setShown(next);
      }
    }, PREVIEW_MIN_MS);
    return () => clearTimeout(id);
  }, [shown]);

  return shown;
};
