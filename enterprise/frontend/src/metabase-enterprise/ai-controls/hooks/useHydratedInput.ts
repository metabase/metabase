import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Holds local input for a setting input
 *
 * Hydrates the local input from the setting value once it has loaded,
 * unless the user has already started editing the input.
 * This prevents the user from losing their input if the setting value changes while they are editing.
 */
export function useHydratedInput<T>({
  value,
  isLoading,
  onHydrate,
}: {
  value: T;
  isLoading: boolean;
  onHydrate?: (value: T) => void;
}) {
  const [inputValue, setInputValue] = useState<T>(value);
  const hasHydrated = useRef(false);
  const hasUserEdited = useRef(false);

  useEffect(() => {
    if (!hasHydrated.current && !isLoading && !hasUserEdited.current) {
      setInputValue(value);
      onHydrate?.(value);
      hasHydrated.current = true;
    }
  }, [isLoading, value, onHydrate]);

  const setInputValueFromUser = useCallback((newValue: T) => {
    hasUserEdited.current = true;
    setInputValue(newValue);
  }, []);

  return { inputValue, setInputValueFromUser };
}
