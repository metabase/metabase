import { useState, useEffect } from "react";

export function useDebouncedEffect<TVALUE>(
  fn: () => TVALUE,
  delay: number,
  dependencies: any[],
) {
  const [debouncedResult, setDebouncedResult] = useState<TVALUE | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const newValue = fn();
      setDebouncedResult(newValue);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
    };
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  return debouncedResult;
}

export function useDebouncedEffectWithCleanup(
  getArgs: () => [() => void, () => void],
  delay: number,
  dependencies: any[],
) {
  const [fn, cleanup] = getArgs();
  useDebouncedEffect(fn, delay, dependencies);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps
}
