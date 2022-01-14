import React, { Key, ReactNode, useMemo } from "react";
import _ from "underscore";
import { RadioColorScheme, RadioVariant } from "./types";
import {
  BubbleItem,
  BubbleList,
  NormalItem,
  NormalList,
  RadioButton,
  RadioIcon,
  RadioInput,
  UnderlinedItem,
  UnderlinedList,
} from "./Radio.styled";

export interface RadioOption<T extends Key> {
  name: ReactNode;
  value: T;
  icon?: string;
}

export interface RadioProps<T extends Key> {
  name?: string;
  value?: T;
  options: RadioOption<T>[];
  onChange?: (value: T) => void;
  onOptionClick?: (value: T) => void;
  optionNameFn?: (option: RadioOption<T>) => ReactNode;
  optionValueFn?: (option: RadioOption<T>) => T;
  optionKeyFn?: (option: RadioOption<T>) => Key;
  showButtons?: boolean;
  xspace?: number;
  yspace?: number;
  py?: number;
  variant?: RadioVariant;
  vertical?: boolean;
  colorScheme?: RadioColorScheme;
}

function defaultNameGetter<T extends Key>(option: RadioOption<T>): ReactNode {
  return option.name;
}

function defaultValueGetter<T extends Key>(option: RadioOption<T>): T {
  return option.value;
}

const VARIANTS = {
  normal: [NormalList, NormalItem],
  bubble: [BubbleList, BubbleItem],
  underlined: [UnderlinedList, UnderlinedItem],
};

function Radio<T extends Key>({
  name: nameFromProps,
  value: currentValue,
  options,

  // onChange won't fire when you click an already checked item
  // onOptionClick will fire in any case
  // onOptionClick can be used for e.g. tab navigation like on the admin Permissions page)
  onOptionClick,
  onChange,

  optionNameFn = defaultNameGetter,
  optionValueFn = defaultValueGetter,
  optionKeyFn = defaultValueGetter,
  variant = "normal",
  vertical = false,
  xspace,
  yspace,
  py,
  showButtons = vertical && variant !== "bubble",
  colorScheme = "default",
  ...props
}: RadioProps<T>) {
  const id = useMemo(() => _.uniqueId("radio-"), []);
  const name = nameFromProps || id;

  const [List, Item] = VARIANTS[variant] || VARIANTS.normal;

  if (variant === "underlined" && currentValue === undefined) {
    console.warn(
      "Radio can't underline selected option when no value is given.",
    );
  }

  return (
    <List
      {...props}
      vertical={vertical}
      showButtons={showButtons}
      colorScheme={colorScheme}
    >
      {options.map((option, index) => {
        const value = optionValueFn(option);
        const selected = currentValue === value;
        const last = index === options.length - 1;
        const key = optionKeyFn(option);
        const id = `${name}-${key}`;
        const labelId = `${id}-label`;
        return (
          <li key={key}>
            <Item
              id={labelId}
              htmlFor={id}
              colorScheme={colorScheme}
              selected={selected}
              last={last}
              vertical={vertical}
              showButtons={showButtons}
              py={py}
              xspace={xspace}
              yspace={yspace}
              onClick={() => {
                if (typeof onOptionClick === "function") {
                  onOptionClick(value);
                }
              }}
            >
              {option.icon && <RadioIcon name={option.icon} />}
              <RadioInput
                id={id}
                name={name}
                value={value}
                checked={selected}
                onChange={() => {
                  if (typeof onChange === "function") {
                    onChange(value);
                  }
                }}
                // Workaround for https://github.com/testing-library/dom-testing-library/issues/877
                aria-labelledby={labelId}
              />
              {showButtons && (
                <RadioButton colorScheme={colorScheme} checked={selected} />
              )}
              <span data-testid={`${id}-name`}>{optionNameFn(option)}</span>
            </Item>
          </li>
        );
      })}
    </List>
  );
}

export default Radio;
