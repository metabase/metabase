import { useState } from "react";

import { AutocompleteInput } from "metabase/common/components/AutocompleteInput";
import type { VisualizationSettings } from "metabase-types/api";

interface ChartSettingLinkUrlInputProps {
  value: string | undefined | null;
  onChange: (value: string) => void;
  id?: string;
  options?: string[];
  onChangeSettings?: (settings: Partial<VisualizationSettings>) => void;
}

const linkVariablePattern = /.*{{([^{}]*)$/;

const filterOptions = (value: string | undefined, options: string[]) => {
  if (options && value) {
    const match = value.match(linkVariablePattern);
    if (match) {
      const suggestionFilter = match[1];
      return options.filter((option) =>
        option.toLowerCase().includes(suggestionFilter.toLowerCase()),
      );
    }
  }
  return [];
};

const ChartSettingLinkUrlInput = ({
  value,
  onChange,
  options,
  ...props
}: ChartSettingLinkUrlInputProps) => {
  const valueOrDefault = value ?? "";
  const [isFocused, setIsFocused] = useState(false);
  const [focusedValue, setFocusedValue] = useState(valueOrDefault);

  const handleSuggestionClick = (suggestion: string) => {
    const match = focusedValue.match(linkVariablePattern);
    const partial = match?.[1];

    if (partial) {
      setFocusedValue((v) => v.replace(`{{${partial}`, `{{${suggestion}}}`));
    } else if (partial === "") {
      setFocusedValue((v) => `${v}${suggestion}}}`);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setFocusedValue(valueOrDefault);
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (focusedValue !== (value ?? "")) {
      onChange(focusedValue);
    }
  };

  return (
    <AutocompleteInput
      {...props}
      data-testid={props.id}
      options={options}
      onChange={setFocusedValue}
      value={isFocused ? focusedValue : valueOrDefault}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onOptionSelect={handleSuggestionClick}
      filterOptions={filterOptions}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingLinkUrlInput;
