import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useLayoutEffect, useState } from "react";

import { parseNumber } from "metabase/querying/filters/utils/numbers";
import { TextInput, type TextInputProps } from "metabase/ui";
import type * as Lib from "metabase-lib";

type NumberFilterInputProps = Omit<TextInputProps, "value" | "onChange"> & {
  value: Lib.NumberFilterValue | "";
  onChange: (value: Lib.NumberFilterValue | "") => void;
};

export const NumberFilterInput = forwardRef(function NumberFilterInput(
  { value, onChange, onFocus, onBlur, ...props }: NumberFilterInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [inputValue, setInputValue] = useState(formatValue(value));
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newInputValue = event.target.value;
    setInputValue(newInputValue);

    const newValue = parseValue(newInputValue);
    onChange?.(newValue);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  useLayoutEffect(() => {
    if (!isFocused) {
      setInputValue(formatValue(value ?? parseValue(inputValue)));
    }
  }, [value, inputValue, isFocused]);

  return (
    <TextInput
      {...props}
      ref={ref}
      value={inputValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
});

function parseValue(value: string) {
  const number = parseNumber(value);
  return number != null ? number : "";
}

function formatValue(value: Lib.NumberFilterValue | "") {
  return String(value);
}
