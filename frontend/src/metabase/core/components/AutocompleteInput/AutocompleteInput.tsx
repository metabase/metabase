import type * as React from "react";
import { useMemo, useRef } from "react";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import SelectList from "metabase/components/SelectList";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import { composeEventHandlers } from "metabase/lib/compose-event-handlers";

import type { InputProps } from "../Input";
import Input from "../Input";

import { OptionsList } from "./AutocompleteInput.styled";

export interface AutocompleteInputProps extends Omit<InputProps, "onChange"> {
  options?: string[];
  filterOptions?: (value: string | undefined, options: string[]) => string[];
  onOptionSelect?: (value: string) => void;
  onChange: (value: string) => void;
}

const filterOptionsByValue = (value: string | undefined, options: string[]) => {
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
  filterOptions = filterOptionsByValue,
  onBlur,
  onOptionSelect,
  ...rest
}: AutocompleteInputProps) => {
  const optionsListRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLDivElement | null>(null);
  const filteredOptions = useMemo(() => {
    return filterOptions(String(value), options);
  }, [value, options, filterOptions]);

  const { cursorIndex } = useListKeyboardNavigation<string, HTMLDivElement>({
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
    if (onOptionSelect) {
      onOptionSelect(option);
    } else {
      onChange(option);
    }
  };

  const handleChange: InputProps["onChange"] = e => {
    onChange(e.target.value);
  };

  return (
    <TippyPopoverWithTrigger
      sizeToFit
      renderTrigger={({ onClick: handleShowPopover, closePopover }) => (
        <Input
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          {...rest}
          value={value}
          onClick={handleShowPopover}
          onFocus={handleShowPopover}
          onChange={composeEventHandlers(handleChange, handleShowPopover)}
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
              <SelectList.Item
                isSelected={cursorIndex === index}
                key={item}
                id={item}
                name={item}
                onSelect={item => {
                  handleOptionSelect(String(item));
                  closePopover();
                }}
              >
                {item}
              </SelectList.Item>
            ))}
          </OptionsList>
        );
      }}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AutocompleteInput;
