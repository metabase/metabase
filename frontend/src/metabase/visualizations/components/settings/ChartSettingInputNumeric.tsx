import type * as React from "react";
import { useState } from "react";
import _ from "underscore";

import { ChartSettingNumericInput } from "./ChartSettingInputNumeric.styled";

const ALLOWED_CHARS = [
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
];

// Note: there are more props than these that are provided by the viz settings
// code, we just don't have types for them here.
interface ChartSettingInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  onChangeSettings: () => void;
  options?: {
    isInteger?: boolean;
    isNonNegative?: boolean;
  };
}

export const ChartSettingInputNumeric = ({
  onChange,
  value,
  options,
  ...props
}: ChartSettingInputProps) => {
  const [internalValue, setInternalValue] = useState(value?.toString() ?? "");

  return (
    <ChartSettingNumericInput
      type="text"
      {..._.omit(props, "onChangeSettings")}
      error={internalValue !== "" && isNaN(Number(internalValue))}
      value={internalValue}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const everyCharValid = e.target.value
          .split("")
          .every(char => ALLOWED_CHARS.includes(char));

        if (everyCharValid) {
          setInternalValue(e.target.value);
        }
      }}
      onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
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
          setInternalValue(String(num));
        }
      }}
    />
  );
};
