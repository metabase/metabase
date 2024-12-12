import { useState } from "react";
import _ from "underscore";

import { TextInput } from "metabase/ui";

interface ChartSettingInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export const ChartSettingInput = ({
  value,
  onChange,
  ...props
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState(value);

  return (
    <TextInput
      data-testid={props.id}
      value={inputValue}
      onChange={e => setInputValue(e.target.value)}
      onBlur={() => {
        if (inputValue !== (value || "")) {
          onChange(inputValue);
        }
      }}
    />
  );
};
