import { useEffect, useState } from "react";

export function useDebouncedValue<TVALUE>(
  value: TVALUE,
  delay: number,
  onlyFor: (lastValue: TVALUE, newValue: TVALUE) => boolean = () => true,
): TVALUE {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (onlyFor) {
      if (onlyFor(debouncedValue, value) === false) {
        setDebouncedValue(value);
        return;
      }
    }

    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, value, onlyFor]);

  return debouncedValue;
}
