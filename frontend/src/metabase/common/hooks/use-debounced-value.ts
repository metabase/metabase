import { useEffect, useState } from "react";

/**
 * @deprecated use `import { useDebouncedValue } from "@mantine/hooks";` instead
 * NOTE: Mantine's useDebouncedValue returns a tuple [value, setValue, cancel] instead of just the value
 * and doesn't support the `onlyFor` parameter. Only use this if you need conditional debouncing.
 */
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
