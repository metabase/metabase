import React, { useState } from "react";
import AutocompleteInput from "metabase/core/components/AutocompleteInput";

interface ChartSettingInputSuggestionProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  options?: string[];
}

const matchPattern = /.*{{([^{}]*)$/;

const filterFn = (value: string | undefined, options: string[]) => {
  if (options && value) {
    const match = value.match(matchPattern);
    if (match) {
      const suggestionFilter = match[1];
      return options.filter(option =>
        option.toLowerCase().includes(suggestionFilter.toLowerCase()),
      );
    }
  }
  return [];
};

const ChartSettingInputSuggestion = ({
  value: initialValue,
  onChange,
  options,
  ...props
}: ChartSettingInputSuggestionProps) => {
  const [value, setValue] = useState(initialValue);

  const handleSuggestionClick = (suggestion: string) => {
    const match = value.match(matchPattern);
    const partial = match?.[1];

    if (partial) {
      setValue(v => v.replace(partial, `${suggestion}}}`));
    } else if (partial === "") {
      setValue(v => `${v}${suggestion}}}`);
    }
  };

  const handleBlur = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <AutocompleteInput
      {...props}
      options={options}
      onChange={setValue}
      value={value}
      onBlur={handleBlur}
      onOptionClick={handleSuggestionClick}
      filterFn={filterFn}
    />
  );
};

export default ChartSettingInputSuggestion;
