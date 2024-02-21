import type * as React from "react";
import { useState } from "react";

import AutocompleteInput from "metabase/core/components/AutocompleteInput";

interface ChartSettingLinkUrlInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  options?: string[];
}

const linkVariablePattern = /.*{{([^{}]*)$/;

const filterOptions = (value: string | undefined, options: string[]) => {
  if (options && value) {
    const match = value.match(linkVariablePattern);
    if (match) {
      const suggestionFilter = match[1];
      return options.filter(option =>
        option.toLowerCase().includes(suggestionFilter.toLowerCase()),
      );
    }
  }
  return [];
};

const ChartSettingLinkUrlInput = ({
  value: initialValue,
  onChange,
  options,
  ...props
}: ChartSettingLinkUrlInputProps) => {
  const [value, setValue] = useState(initialValue);

  const handleSuggestionClick = (suggestion: string) => {
    const match = value.match(linkVariablePattern);
    const partial = match?.[1];

    if (partial) {
      setValue(v => v.replace(`{{${partial}`, `{{${suggestion}}}`));
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
      data-testid={props.id}
      options={options}
      onChange={setValue}
      value={value}
      onBlur={handleBlur}
      onOptionSelect={handleSuggestionClick}
      filterOptions={filterOptions}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingLinkUrlInput;
