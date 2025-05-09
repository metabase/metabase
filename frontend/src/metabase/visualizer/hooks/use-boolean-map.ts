import { useCallback, useState } from "react";

/**
 * A hook to manage one boolean state per key in an object.
 */
export const useBooleanMap = () => {
  const [values, setValues] = useState<Record<string, boolean>>({});

  const toggle = useCallback(
    (key: string) => {
      setValues((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    [setValues],
  );

  const setValue = useCallback(
    (key: string, value: boolean) => {
      setValues((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [setValues],
  );
  return { values, toggle, setValue };
};
