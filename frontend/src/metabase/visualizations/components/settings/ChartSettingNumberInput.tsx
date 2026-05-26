import { NumberInput } from "metabase/ui";

import type { ChartSettingWidgetProps } from "./types";

interface ChartSettingNumberInputProps extends Omit<
  ChartSettingWidgetProps<number>,
  "onChangeSettings"
> {
  id?: string;
  placeholder?: string;
  min?: number;
  max?: number;
}

export const ChartSettingNumberInput = ({
  value,
  onChange,
  id,
  placeholder,
  min = -Infinity,
  max = Infinity,
}: ChartSettingNumberInputProps) => {
  const handleChange = (newValue: number | string) => {
    onChange(Number(newValue));
  };

  return (
    <NumberInput
      id={id}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      min={min}
      max={max}
      allowDecimal={false}
      allowNegative={min < 0}
      hideControls={false}
    />
  );
};
