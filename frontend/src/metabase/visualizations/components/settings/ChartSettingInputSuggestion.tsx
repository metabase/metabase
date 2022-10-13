import React, { useState, useRef } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import SelectList from "metabase/components/SelectList";
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

const ChartSettingInputSuggestion = ({
  value: initialValue,
  onChange,
  options,
  ...props
}: ChartSettingInputSuggestionProps) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [value, setValue] = useState(initialValue);
  const optionsListRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  const { cursorIndex } = useListKeyboardNavigation({
    list: suggestions,
    onEnter: (item: string) => handleSuggestionClick(item),
    resetOnListChange: true,
    ref: inputRef,
  });

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
            {suggestions.map((option, index) => (
              <SelectList.Item
                key={option}
                id={option}
                name={option}
                isSelected={index === cursorIndex}
                onSelect={() => {
                  handleSuggestionClick(option);
                }}
              >
                {option}
              </SelectList.Item>
            ))}
          </SuggestionContainer>
        );
      }}
    />
  );
};

export default ChartSettingInputSuggestion;
