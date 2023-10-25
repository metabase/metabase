import { useLayoutEffect, useState } from "react";
import type { ChangeEvent } from "react";
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
  ...props
}: TimeInputProps) {
  const [inputValue, setInputValue] = useState(
    defaultValue ? formatTime(defaultValue) : "",
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newInputValue = event.target.value;
    setInputValue(newInputValue);

    const newTime = parseTime(newInputValue);
    newTime && onChange?.(newTime);
  };

  const handleBlur = () => {
    value && setInputValue(formatTime(value));
  };

  useLayoutEffect(() => {
    value && setInputValue(formatTime(value));
  }, [value]);

  return (
    <MantineTimeInput
      {...props}
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

function formatTime(time: Date) {
  return dayjs(time).format(TIME_FORMAT);
}

function parseTime(value: string) {
  const time = dayjs(value, TIME_FORMAT, true);
  return time.isValid() ? time.toDate() : undefined;
}
