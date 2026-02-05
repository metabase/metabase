import { type FocusEvent, useCallback, useState } from "react";

import type { NumberInputProps } from "metabase/ui";
import { NumberInput } from "metabase/ui";

export function NumberInputWithFallbackValue({
  value,
  onBlur,
  onChange,
  ...rest
}: NumberInputProps) {
  const [displayValue, setDisplayValue] = useState<string | number | undefined>(
    value,
  );

  // Force the displayed value to the current value when the input loses focus.
  // E.g. user deletes the input value and then clicks outside the input.
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onBlur?.(event);
      setDisplayValue(value);
    },
    [value, onBlur],
  );

  const handleChange = useCallback(
    (value: string | number) => {
      setDisplayValue(value);
      onChange?.(value);
    },
    [onChange],
  );

  return (
    <NumberInput
      onBlur={handleBlur}
      value={displayValue}
      onChange={handleChange}
      {...rest}
    />
  );
}
