import { useState } from "react";
import _ from "underscore";

import { Text, TextInput } from "metabase/ui";

interface ChartSettingInputProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export const ChartSettingInput = ({
  value,
  onChange,
  title,
  ...props
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState(value);

  return (
    <TextInput
      label={<Text>{title}</Text>}
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
