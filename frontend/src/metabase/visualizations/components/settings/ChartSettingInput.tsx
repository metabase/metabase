import React from "react";
import { ChartSettingInputBlurChange } from "./ChartSettingInput.styled";

interface ChartSettingInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  onChangeSettings: () => void;
}

const ChartSettingInput = ({
  value,
  onChange,
  onChangeSettings,
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
