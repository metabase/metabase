import type { NumberInputProps } from "@mantine/core";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useLayoutEffect, useState } from "react";

import { TextInput } from "../TextInput";

interface Props extends NumberInputProps {
  parseValue?: (value: string) => number | "";
}

export const NumberInput = forwardRef(function NumberInput(
  {
    value,
    defaultValue = value,
    onChange,
    onFocus,
    onBlur,
    parseValue = defaultParseValue,
    ...props
  }: Props,
  ref: Ref<HTMLInputElement>,
) {
  const [inputValue, setInputValue] = useState(formatValue(defaultValue ?? ""));
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
  }, [value, inputValue, isFocused, parseValue]);

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

function defaultParseValue(value: string): number | "" {
  const number = parseFloat(value);
  return Number.isNaN(number) ? "" : number;
}

function formatValue(value: number | "") {
  return String(value);
}
