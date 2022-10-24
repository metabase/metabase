import React, { useMemo, useRef } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import SelectList from "metabase/components/SelectList";
import TextInput from "metabase/components/TextInput";
import { TextInputProps } from "metabase/components/TextInput/TextInput";

import { composeEventHandlers } from "metabase/lib/compose-event-handlers";
import { OptionsList } from "./AutocompleteInput.styled";

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
  const optionsListRef = useRef<HTMLUListElement>();
  const filteredOptions = useMemo(() => {
    return filterFn(value, options);
  }, [value, options]);

  console.log(onOptionClick);

  const handleListMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (optionsListRef.current?.contains(event.target as Node)) {
      event.preventDefault();
    }
  };

  return (
    <TippyPopoverWithTrigger
      sizeToFit
      renderTrigger={({ onClick: handleShowPopover, closePopover }) => (
        <TextInput
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
          <OptionsList
            ref={optionsListRef as any}
            onMouseDown={handleListMouseDown}
          >
            {filteredOptions.map(option => (
              <SelectList.Item
                key={option}
                id={option}
                name={option}
                onSelect={option => {
                  if (onOptionClick) {
                    console.log("optionclick", onOptionClick);
                    onOptionClick(option);
                  } else {
                    console.log("onChange", onChange);
                    onChange(option);
                  }
                  closePopover();
                }}
              >
                {option}
              </SelectList.Item>
            ))}
          </OptionsList>
        );
      }}
    />
  );
};

export default AutocompleteInput;
