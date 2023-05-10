import React, { useState } from "react";
import _ from "underscore";
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

  return (
    <ChartSettingNumericInput
      type="number"
      {..._.omit(props, "onChangeSettings")}
      error={!!internalValue && isNaN(internalValue)}
      value={internalValue}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const num = parseFloat(e.target.value);
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingInputNumeric;
