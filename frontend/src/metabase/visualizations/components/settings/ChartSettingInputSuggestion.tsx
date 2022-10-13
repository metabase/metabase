import React, { useState, useRef } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import {
  SuggestionInput,
  SuggestionContainer,
  Suggestion,
} from "./ChartSettingInputSuggestion.styled";

interface ChartSettingInputSuggestionProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  options?: string[];
}

const matchPattern = /.*{{([^{}]*)$/;

const ChartSettingInputSuggestion = ({
  value: initialValue,
  onChange,
  options,
  ...props
}: ChartSettingInputSuggestionProps) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [value, setValue] = useState(initialValue);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleChange = (text: string) => {
    if (options) {
      const match = text.match(matchPattern);

      if (match) {
        const suggestionFilter = match[1];

        setSuggestions(
          options.filter(option =>
            option.toLowerCase().includes(suggestionFilter.toLowerCase()),
          ),
        );
      } else {
        setSuggestions([]);
      }
    }
    setValue(text);
  };

  const handleSuggestionClick = (suggestion: string) => {
    const match = value.match(matchPattern);
    const partial = match?.[1];

    if (partial) {
      setValue(v => v.replace(partial, `${suggestion}}}`));
    } else if (partial === "") {
      setValue(v => `${v}${suggestion}}}`);
    }
    setSuggestions([]);
  };

  const handleListMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (optionsListRef.current?.contains(event.target as Node)) {
      event.preventDefault();
    }
  };

  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick: handleShowPopover }) => (
        <SuggestionInput
          {...props}
          ref={inputRef}
          data-testid={props.id}
          value={value}
          onClick={handleShowPopover}
          onFocus={handleShowPopover}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => onChange(value)}
        />
      )}
      placement="bottom-start"
      popoverContent={() => {
        if (suggestions.length === 0) {
          return null;
        }

        return (
          <SuggestionContainer
            ref={optionsListRef}
            onMouseDown={handleListMouseDown}
            style={{ width: inputRef.current?.offsetWidth }}
          >
            {suggestions.map(option => (
              <Suggestion
                key={option}
                onClick={() => {
                  handleSuggestionClick(option);
                }}
              >
                {option}
              </Suggestion>
            ))}
          </SuggestionContainer>
        );
      }}
    />
  );
};

export default ChartSettingInputSuggestion;
