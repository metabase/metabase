import { useState } from "react";
import _ from "underscore";

import { NumberInput } from "metabase/ui";

import type { ChartSettingWidgetProps } from "./types";

// Note: there are more props than these that are provided by the viz settings
// code, we just don't have types for them here.
interface ChartSettingInputProps extends ChartSettingWidgetProps<number> {
  options?: {
    isInteger?: boolean;
    isNonNegative?: boolean;
  };
}

export const ChartSettingInputNumeric = ({
  onChange,
  value,
  options,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState<number | "">(value ?? "");

  return (
    <NumberInput
      type="number"
      value={inputValue}
      onChange={setInputValue}
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
          setInputValue(num);
        }
      }}
    />
  );
};
