import React, { useMemo } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { SelectList } from "metabase/components/select-list";
import TextInput from "metabase/components/TextInput";
import { TextInputProps } from "metabase/components/TextInput/TextInput";

import { OptionsList } from "./AutocompleteInput.styled";

interface AutocompleteInputProps extends TextInputProps {
  options?: string[];
}

const AutocompleteInput = ({
  value,
  onChange,
  options = [],
  ...rest
}: AutocompleteInputProps) => {
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

  return (
    <TippyPopoverWithTrigger
      sizeToFit
      renderTrigger={({ onClick: handleShowPopover }) => (
        <TextInput
          role="combobox"
          aria-autocomplete="list"
          {...rest}
          value={value}
          onChange={onChange}
          onClick={handleShowPopover}
          onFocus={handleShowPopover}
        />
      )}
      placement="bottom-start"
      popoverContent={({ closePopover }) => {
        if (filteredOptions.length === 0) {
          return null;
        }

        return (
          <OptionsList>
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
