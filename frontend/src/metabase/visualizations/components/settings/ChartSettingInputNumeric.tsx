import { useState } from "react";
import _ from "underscore";

import { NumberInput, Text } from "metabase/ui";

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
  label,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState<number | "">(value ?? "");

  return (
    <NumberInput
      type="number"
      label={<Text>{label}</Text>}
      value={inputValue}
      onChange={setInputValue}
      precision={options?.isInteger ? 0 : undefined}
      min={options?.isNonNegative ? 0 : undefined}
      onBlur={() => onChange(inputValue || undefined)}
    />
  );
};
