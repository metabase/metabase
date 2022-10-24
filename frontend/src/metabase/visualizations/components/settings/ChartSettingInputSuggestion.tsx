import React, { useState, useRef } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import SelectList from "metabase/components/SelectList";
import AutocompleteInput from "metabase/core/components/AutocompleteInput";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import {
  SuggestionInput,
  SuggestionContainer,
} from "./ChartSettingInputSuggestion.styled";

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
    } else {
      return [];
    }
  }
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

  return (
    <AutocompleteInput
      options={options}
      value={value}
      onBlur={onChange}
      onOptionClick={handleSuggestionClick}
      filterFn={filterFn}
    />
  );
};

export default ChartSettingInputSuggestion;
