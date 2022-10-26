import React from "react";
import { ChartSettingInputBlurChange } from "./ChartSettingInput.styled";

interface ChartSettingInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

const ChartSettingInput = ({
  value,
  onChange,
  ...props
}: ChartSettingInputProps) => (
  <ChartSettingInputBlurChange
    {...props}
    data-testid={props.id}
    value={value}
    onBlurChange={e => onChange(e.target.value)}
  />
);

export default ChartSettingInput;
