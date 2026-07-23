import { useEffect, useRef, useState } from "react";
import { useInterval } from "react-use";

import { NOW_TICK_MS, PREVIEW_MIN_MS } from "./constants";

export const useNow = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), active ? NOW_TICK_MS : null);
  return now;
};

export const useAutoCollapseOnSettle = (isStreaming: boolean) => {
  const [open, setOpen] = useState(false);
  const hasSettledRef = useRef(false);

  useEffect(() => {
    if (!isStreaming && !hasSettledRef.current) {
      hasSettledRef.current = true;
      setOpen(false);
    }
  }, [isStreaming]);

  return { open, toggle: () => setOpen((prev) => !prev) };
};

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
