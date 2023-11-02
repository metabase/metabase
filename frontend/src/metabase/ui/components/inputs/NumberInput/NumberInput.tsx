import { useState } from "react";
import type { ChangeEvent, FocusEvent } from "react";
import type { NumberInputProps } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import { TextInput } from "../TextInput";

export function NumberInput({
  value: controlledValue,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  ...props
}: NumberInputProps) {
  const [value, setValue] = useUncontrolled({
    value: controlledValue,
    defaultValue,
    finalValue: "",
    onChange,
  });
  const [inputValue, setInputValue] = useState(formatValue(value));
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newInputValue = event.target.value;
    setInputValue(newInputValue);

    const newValue = parseValue(newInputValue);
    setValue(newValue);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setInputValue(formatValue(value));
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setInputValue(formatValue(value));
    setIsFocused(false);
    onBlur?.(event);
  };

  return (
    <TextInput
      {...props}
      value={isFocused ? inputValue : formatValue(value)}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

function parseValue(value: string) {
  const number = parseFloat(value);
  return Number.isNaN(number) ? "" : number;
}

function formatValue(value: number | "") {
  return String(value);
}
