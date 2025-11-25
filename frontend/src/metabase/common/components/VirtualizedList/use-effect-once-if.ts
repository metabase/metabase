import type { EffectCallback } from "react";
import { useEffect, useRef } from "react";

export function useEffectOnceIf(
  effect: EffectCallback,
  condition: boolean,
): void {
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Stop if we already called `effect` before or if the condition is not met
    if (hasRunRef.current || !condition) {
      return;
    }

    hasRunRef.current = true;
    return effect();
  }, [effect, condition]);
}
