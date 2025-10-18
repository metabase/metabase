import { useState } from "react";

import { TextInput } from "metabase/ui";

import type { ChartSettingWidgetProps } from "./types";

type NumberOptions = {
  isInteger?: boolean;
  isNonNegative?: boolean;
};

// Note: there are more props than these that are provided by the viz settings
// code, we just don't have types for them here.
interface ChartSettingInputProps
  extends Omit<ChartSettingWidgetProps<number>, "onChangeSettings"> {
  options?: NumberOptions;
  id?: string;
  placeholder?: string;
  getDefault?: () => string;
  className?: string;
}

export const ChartSettingInputNumeric = ({
  onChange,
  value,
  placeholder,
  options = {},
  id,
  getDefault,
  className,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState<string>(value?.toString() ?? "");
  const defaultValueProps = getDefault ? { defaultValue: getDefault() } : {};

  const num = parseNumber(inputValue, options);
  const isValid = inputValue === undefined || inputValue === "" || !isNaN(num);

  return (
    <TextInput
      id={id}
      {...defaultValueProps}
      placeholder={placeholder}
      type="text"
      error={!isValid}
      value={inputValue}
      onChange={(event) => setInputValue(event.target.value)}
      onBlur={(event) => {
        const num = parseNumber(event.target.value, options);
        if (!isNaN(num)) {
          onChange(num);

          // Only change the text in the input if the value actually changed
          if (num !== parseFloat(inputValue)) {
            setInputValue(num.toString());
          }
        } else {
          onChange(undefined);
          setInputValue("");
        }
      }}
      className={className}
    />
  );
};

function parseNumber(value: string, options: NumberOptions) {
  let num = value !== "" ? Number(value) : Number.NaN;

  if (options?.isInteger) {
    num = Math.round(num);
  }

  if (options?.isNonNegative && num < 0) {
    num *= -1;
  }

  return num;
}
