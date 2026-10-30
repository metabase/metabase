import { useEffect, useState } from "react";

/**
 * Returns `false` until the browser has painted at least one frame after the
 * component mounted, then `true`.
 */
export function useHasPaintedSinceMount(): boolean {
  const [hasPainted, setHasPainted] = useState(false);

  useEffect(() => {
    // The first frame callback runs before that frame is painted, so wait for
    // the second one.
    let frameId = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(() => setHasPainted(true));
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  return hasPainted;
}
