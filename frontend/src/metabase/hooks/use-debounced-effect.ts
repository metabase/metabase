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

    return () => clearTimeout(timeoutId);
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  return debouncedResult;
}
