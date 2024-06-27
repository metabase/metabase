import type { NumberInputProps as MantineNumberInputProps } from "@mantine/core";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useLayoutEffect, useState } from "react";

import { formatNumber, parseNumber } from "metabase/ui/utils/numbers";
import type { NumericValue } from "metabase-types/api/number";

import { TextInput } from "../TextInput";

interface NumberInputProps
  extends Omit<MantineNumberInputProps, "value" | "defaultValue" | "onChange"> {
  value?: NumericValue | "";
  defaultValue?: NumericValue | "";
  onChange?: (value: NumericValue) => void;
}

export const NumberInput = forwardRef(function NumberInput(
  {
    value,
    defaultValue = value,
    onChange,
    onFocus,
    onBlur,
    ...props
  }: NumberInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [inputValue, setInputValue] = useState(
    formatNumber(defaultValue ?? ""),
  );
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newInputValue = event.target.value;
    setInputValue(newInputValue);

    const newValue = parseNumber(newInputValue);
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
      setInputValue(formatNumber(value ?? parseNumber(inputValue)));
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
