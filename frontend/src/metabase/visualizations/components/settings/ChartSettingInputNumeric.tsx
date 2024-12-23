import { type ChangeEvent, useState } from "react";
import _ from "underscore";

import { TextInput } from "metabase/ui";

import type { ChartSettingWidgetProps } from "./types";

const ALLOWED_CHARS = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "-",
  "e",
]);

// Note: there are more props than these that are provided by the viz settings
// code, we just don't have types for them here.
interface ChartSettingInputProps extends ChartSettingWidgetProps<number> {
  options?: {
    isInteger?: boolean;
    isNonNegative?: boolean;
  };
  id?: string;
  placeholder?: string;
  getDefault?: () => string;
}

export const ChartSettingInputNumeric = ({
  onChange,
  value,
  placeholder,
  options,
  id,
  getDefault,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState<string>(value?.toString() ?? "");
  const defaultValueProps = getDefault ? { defaultValue: getDefault() } : {};

  return (
    <TextInput
      id={id}
      {...defaultValueProps}
      placeholder={placeholder}
      type="text"
      error={inputValue && isNaN(Number(inputValue))}
      value={String(inputValue)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.value.split("").every(ch => ALLOWED_CHARS.has(ch))) {
          setInputValue(e.target.value);
        }
      }}
      onBlur={e => {
        let num = e.target.value !== "" ? Number(e.target.value) : Number.NaN;
        if (options?.isInteger) {
          num = Math.round(num);
        }
        if (options?.isNonNegative && num < 0) {
          num *= -1;
        }

        if (isNaN(num)) {
          onChange(undefined);
        } else {
          onChange(num);
          setInputValue(String(num));
        }
      }}
    />
  );
};
