import { useCallback, useEffect, useRef, useState } from "react";

/**
 * it's a copy of mantine's useInterval, but with memoization of the callbacks
 */
export function useInterval(fn: () => void, interval: number) {
  const [active, setActive] = useState(false);
  const intervalRef = useRef<number>();
  const fnRef = useRef<() => void>();

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const start = useCallback(() => {
    setActive(old => {
      if (!old && !intervalRef.current) {
        intervalRef.current = window.setInterval(fnRef.current!, interval);
      }
      return true;
    });
  }, [interval, fnRef]);

  const stop = useCallback(() => {
    setActive(false);
    window.clearInterval(intervalRef.current);
    intervalRef.current = undefined;
  }, []);

  const toggle = useCallback(() => {
    if (active) {
      stop();
    } else {
      start();
    }
  }, [active, start, stop]);

  return { start, stop, toggle, active };
}
