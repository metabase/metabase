import { useDisclosure } from "@mantine/hooks";
import { useMemo, useRef } from "react";

import { SelectList } from "metabase/common/components/SelectList";
import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import { Popover } from "metabase/ui";
import type { VisualizationSettings } from "metabase-types/api";

import type { InputProps } from "../Input";
import { Input } from "../Input";

import { OptionsList } from "./AutocompleteInput.styled";

export interface AutocompleteInputProps extends Omit<InputProps, "onChange"> {
  options?: string[];
  filterOptions?: (value: string | undefined, options: string[]) => string[];
  onOptionSelect?: (value: string) => void;
  onChangeSettings?: (settings: Partial<VisualizationSettings>) => void;
  onChange: (value: string) => void;
}

const filterOptionsByValue = (value: string | undefined, options: string[]) => {
  if (!value || value.length === 0) {
    return options;
  }

  return options.filter((option) => {
    const optionLowerCase = option.toLowerCase().trim();
    const valueLowerCase = value.toLowerCase().trim();
    return (
      optionLowerCase.includes(valueLowerCase) &&
      !(optionLowerCase === valueLowerCase)
    );
  });
};

export const AutocompleteInput = ({
  value,
  onChange,
  options = [],
  filterOptions = filterOptionsByValue,
  onFocus,
  onBlur,
  onOptionSelect,
  onChangeSettings,
  ...rest
}: AutocompleteInputProps) => {
  const optionsListRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLDivElement | null>(null);
  const [isOpened, { open, close }] = useDisclosure(false);
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
      // also stops the native event before it reaches document, where the
      // click-outside handler of a parent popover would treat a click on the
      // portaled options list as an outside click and close that popover
      event.stopPropagation();
    }
  };

  const handleOptionSelect = (option: string) => {
    if (onOptionSelect) {
      onOptionSelect(option);
    } else {
      onChange(option);
    }
  };

  const handleChange: InputProps["onChange"] = (e) => {
    onChange(e.target.value);
  };

  const isDropdownOpened = isOpened && filteredOptions.length > 0;

  return (
    <Popover
      opened={isDropdownOpened}
      onClose={close}
      position="bottom-start"
      // with roles enabled Popover.Target overrides the input id with its own
      // generated one, breaking the <label htmlFor> association
      withRoles={false}
    >
      <Popover.Target>
        <Input
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isDropdownOpened}
          {...rest}
          value={value}
          onClick={open}
          onFocus={(evt) => {
            onFocus?.(evt);
            open();
          }}
          onChange={(evt) => {
            handleChange(evt);
            open();
          }}
          onBlur={(evt) => {
            onBlur?.(evt);
            close();
          }}
          onKeyDown={(evt) => {
            if (evt.key === "Escape") {
              close();
            }
          }}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <OptionsList ref={optionsListRef} onMouseDown={handleListMouseDown}>
          {filteredOptions.map((item, index) => (
            <SelectList.Item
              isSelected={cursorIndex === index}
              key={item}
              id={item}
              name={item}
              onSelect={(item) => {
                handleOptionSelect(String(item));
                close();
              }}
            >
              {item}
            </SelectList.Item>
          ))}
        </OptionsList>
      </Popover.Dropdown>
    </Popover>
  );
};
