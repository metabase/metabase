import React, { useMemo, useRef } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import SelectList from "metabase/components/SelectList";
import TextInput from "metabase/components/TextInput";
import { TextInputProps } from "metabase/components/TextInput/TextInput";

import { OptionsList } from "./AutocompleteInput.styled";
import { composeEventHandlers } from "metabase/lib/compose-event-handlers";

interface AutocompleteInputProps extends TextInputProps {
  options?: string[];
}

const AutocompleteInput = ({
  value,
  onChange,
  options = [],
  onBlur,
  ...rest
}: AutocompleteInputProps) => {
  const optionsListRef = useRef<HTMLUListElement>();
  const filteredOptions = useMemo(() => {
    if (!value || value.length === 0) {
      return options;
    }

    return options.filter(option => {
      const optionLowerCase = option.toLowerCase().trim();
      const valueLowerCase = value.toLowerCase().trim();
      return (
        optionLowerCase.includes(value) && !(optionLowerCase === valueLowerCase)
      );
    });
  }, [value, options]);

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
                  onChange(option);
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
