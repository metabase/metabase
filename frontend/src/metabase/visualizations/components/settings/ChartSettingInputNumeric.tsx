import React, { useState } from "react";
import { ChartSettingNumericInput } from "./ChartSettingInputNumeric.styled";

interface ChartSettingInputProps {
  value: number;
  onChange: (value: number | undefined) => void;
  onChangeSettings: () => void;
}

const ChartSettingInputNumeric = ({
  onChange,
  value,
  ...props
}: ChartSettingInputProps) => {
  const [internalValue, setInternalValue] = useState(value);

  const { onChangeSettings, ...inputProps } = props;

  return (
    <ChartSettingNumericInput
      type="number"
      {...inputProps}
      error={!!internalValue && isNaN(internalValue)}
      value={internalValue}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const num = parseFloat(e.target.value);
        if (!isNaN(num) && num !== value) {
          onChange(num);
        }
        setInternalValue(num);
      }}
      onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
        const num = parseFloat(e.target.value);
        if (isNaN(num)) {
          onChange(undefined);
        } else {
          onChange(num);
        }
      }}
    />
  );
};

export default ChartSettingInputNumeric;
