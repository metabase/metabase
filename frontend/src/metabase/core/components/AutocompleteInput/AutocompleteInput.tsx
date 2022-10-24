import React, { useMemo, useRef } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import SelectList from "metabase/components/SelectList";
import TextInput from "metabase/components/TextInput";
import { TextInputProps } from "metabase/components/TextInput/TextInput";

import { composeEventHandlers } from "metabase/lib/compose-event-handlers";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";

import { OptionsList, OptionItem } from "./AutocompleteInput.styled";

interface AutocompleteInputProps extends TextInputProps {
  options?: string[];
  filterFn?: (value: string | undefined, options: string[]) => string[];
  onOptionClick?: (value: string) => void;
}

const DeafultFilterFn = (value: string | undefined, options: string[]) => {
  if (!value || value.length === 0) {
    return options;
  }

  return options.filter(option => {
    const optionLowerCase = option.toLowerCase().trim();
    const valueLowerCase = value.toLowerCase().trim();
    return (
      optionLowerCase.includes(valueLowerCase) &&
      !(optionLowerCase === valueLowerCase)
    );
  });
};

const AutocompleteInput = ({
  value,
  onChange,
  options = [],
  filterFn = DeafultFilterFn,
  onBlur,
  onOptionClick,
  ...rest
}: AutocompleteInputProps) => {
  const optionsListRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const filteredOptions = useMemo(() => {
    return filterFn(value, options);
  }, [value, options, filterFn]);

  const { cursorIndex } = useListKeyboardNavigation({
    list: filteredOptions,
    onEnter: (item: string) => handleOptionSelect(item),
    resetOnListChange: true,
    ref: inputRef,
  });

  const handleListMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (optionsListRef.current?.contains(event.target as Node)) {
      event.preventDefault();
    }
  };

  const handleOptionSelect = (option: string) => {
    if (onOptionClick) {
      onOptionClick(option);
    } else {
      onChange(option);
    }
  };

  return (
    <TippyPopoverWithTrigger
      sizeToFit
      renderTrigger={({ onClick: handleShowPopover, closePopover }) => (
        <TextInput
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          {...rest}
          value={value}
          onClick={handleShowPopover}
          onFocus={handleShowPopover}
          onChange={composeEventHandlers(onChange, handleShowPopover)}
          onBlur={composeEventHandlers<React.FocusEvent<HTMLInputElement>>(
            onBlur,
            closePopover,
          )}
        />
      )}
      placement="bottom-start"
      popoverContent={({ closePopover }) => {
        if (filteredOptions.length === 0) {
          return null;
        }

        return (
          <OptionsList ref={optionsListRef} onMouseDown={handleListMouseDown}>
            {filteredOptions.map((item, index) => (
              <OptionItem
                isSelected={cursorIndex === index}
                key={item}
                id={item}
                name={item}
                onSelect={item => {
                  handleOptionSelect(item);
                  closePopover();
                }}
              >
                {item}
              </OptionItem>
            ))}
          </OptionsList>
        );
      }}
    />
  );
};

export default AutocompleteInput;
