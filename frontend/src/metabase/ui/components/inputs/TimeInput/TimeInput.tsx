import { useLayoutEffect, useState } from "react";
import type { FocusEvent, ChangeEvent } from "react";
import dayjs from "dayjs";
import { TimeInput as MantineTimeInput } from "@mantine/dates";
import type { TimeInputProps as MantineTimeInputProps } from "@mantine/dates";

const TIME_FORMAT = "HH:mm";

export type TimeInputProps = Omit<
  MantineTimeInputProps,
  "value" | "defaultValue" | "onChange"
> & {
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (value: Date) => void;
};

export function TimeInput({
  value,
  defaultValue = value,
  onChange,
  onFocus,
  onBlur,
  ...props
}: TimeInputProps) {
  const [inputValue, setInputValue] = useState(formatValue(defaultValue));
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newInputValue = event.target.value;
    setInputValue(newInputValue);

    const newValue = parseValue(newInputValue);
    if (newValue != null) {
      onChange?.(newValue);
    }
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
    if (value != null && !isFocused) {
      setInputValue(formatValue(value));
    }
  }, [value, isFocused]);

  return (
    <MantineTimeInput
      {...props}
      value={inputValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

function formatValue(value: Date | null | undefined) {
  return value ? dayjs(value).format(TIME_FORMAT) : "";
}

function parseValue(value: string) {
  const time = dayjs(value, TIME_FORMAT, true);
  return time.isValid() ? time.toDate() : null;
}
