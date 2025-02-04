import { useState } from "react";
import _ from "underscore";

import { TextInput } from "metabase/ui";

import { ChartSettingValuePicker } from "./ChartSettingValuePicker";

interface ChartSettingInputProps {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  id?: string;
}

export const ChartSettingInput = ({
  value,
  onChange,
  placeholder,
  id,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState(value);

  return (
    <TextInput
      id={id}
      data-testid={id}
      placeholder={placeholder}
      value={inputValue}
      onChange={e => setInputValue(e.target.value)}
      onBlur={() => {
        if (inputValue !== (value || "")) {
          onChange(inputValue);
        }
      }}
      // TODO - only show if setting accepts a reference value
      rightSection={<ChartSettingValuePicker />}
    />
  );
};
