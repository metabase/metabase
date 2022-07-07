import { useState, useEffect } from "react";

export function useDebouncedFunction<TVALUE>(
  fn: () => TVALUE,
  delay: number,
  dependencies: any[],
) {
  const [debouncedValue, setDebouncedValue] = useState<TVALUE | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      const newValue = fn();
      setDebouncedValue(newValue);
    }, delay);

    return () => clearTimeout(handler);
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  return debouncedValue;
}
