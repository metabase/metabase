import { useCallback, useState } from "react";

/**
 * A hook to manage one boolean state per key in an object.
 */
export const useBooleanMap = () => {
  const [values, setValues] = useState<Record<string, boolean>>({});

  const toggle = useCallback(
    (key: string) => {
      setValues((prev) => {
        if (prev[key] === true) {
          const { [key]: _, ...rest } = prev;
          return rest;
        }

        return {
          ...prev,
          [key]: true,
        };
      });
    },
    [setValues],
  );

  const setValue = useCallback(
    (key: string, value: boolean) => {
      setValues((prev) => {
        if (value) {
          return {
            ...prev,
            [key]: true,
          };
        }

        const { [key]: _, ...rest } = prev;
        return rest;
      });
    },
    [setValues],
  );
  return { values, toggle, setValue };
};
