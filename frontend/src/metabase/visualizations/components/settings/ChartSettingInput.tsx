import { useState } from "react";
import _ from "underscore";

import { TextInput } from "metabase/ui";
import { isVizSettingColumnReference } from "metabase-types/guards";

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
  columnReferenceConfig,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState(value);

  return (
    <TextInput
      id={id}
      data-testid={id}
      placeholder={placeholder}
      disabled={isVizSettingColumnReference(value)}
      value={
        isVizSettingColumnReference(value)
          ? `${value.column_name} (card ${value.card_id})`
          : String(inputValue)
      }
      onChange={e => setInputValue(e.target.value)}
      onBlur={() => {
        if (inputValue !== (value || "")) {
          onChange(inputValue);
        }
      }}
      rightSection={
        !!columnReferenceConfig && (
          <ChartSettingValuePicker
            value={isVizSettingColumnReference(value) ? value : undefined}
            columnReferenceConfig={columnReferenceConfig}
            onChange={onChange}
          />
        )
      }
    />
  );
};
