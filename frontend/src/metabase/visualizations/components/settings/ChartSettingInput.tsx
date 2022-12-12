import React from "react";
import _ from "underscore";
import { ChartSettingTextInput } from "./ChartSettingInput.styled";

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
  <ChartSettingTextInput
    {..._.omit(props, "onChangeSettings")}
    data-testid={props.id}
    value={value}
    onBlurChange={e => onChange(e.target.value)}
    fullWidth
  />
);

export default ChartSettingInput;
