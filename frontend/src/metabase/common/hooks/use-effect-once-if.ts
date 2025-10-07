import type { DependencyList, EffectCallback } from "react";
import { useEffect, useRef } from "react";

export function useEffectOnceIf<TDependencies extends DependencyList>(
  effect: EffectCallback,
  dependencies: TDependencies,
  condition: boolean,
): void {
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Stop if we already called `effect` before

    if (hasRunRef.current) {
      return;
    }

    // Stop if we have conditions defined but those conditions are not met
    if (!condition) {
      return;
    }

    hasRunRef.current = true;

    return effect();
  }, [effect, dependencies, condition]);
}
