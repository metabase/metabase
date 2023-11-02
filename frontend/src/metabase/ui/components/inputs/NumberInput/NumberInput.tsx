import { useLayoutEffect, useState } from "react";
import type { ChangeEvent, FocusEvent } from "react";
import type { NumberInputProps } from "@mantine/core";
import { TextInput } from "../TextInput";

export function NumberInput({
  value,
  defaultValue = value,
  onChange,
  onBlur,
  ...props
}: NumberInputProps) {
  const [inputValue, setInputValue] = useState(
    defaultValue != null ? String(defaultValue) : "",
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newInputValue = event.target.value;
    setInputValue(newInputValue);

    const newValue = parseNumber(newInputValue);
    if (newInputValue === "") {
      onChange?.("");
    } else if (newValue != null) {
      onChange?.(newValue);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (value != null) {
      setInputValue(String(value));
    } else {
      const newValue = parseNumber(inputValue);
      setInputValue(newValue != null ? String(newValue) : "");
    }

    onBlur?.(event);
  };

  useLayoutEffect(() => {
    value && setInputValue(String(value));
  }, [value]);

  return (
    <TextInput
      {...props}
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

function parseNumber(value: string) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : undefined;
}
