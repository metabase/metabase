import React, { ComponentType, Key } from "react";
import { RadioColorScheme, RadioVariant } from "./types";
import {
  RadioBubbleList,
  RadioButton,
  RadioInput,
  RadioItem,
  RadioLabel,
  RadioListProps,
  RadioNormalList,
  RadioText,
  RadioUnderlinedList,
} from "./Radio.styled";

export interface RadioProps<TValue, TOption = RadioOption<TValue>> {
  name?: string;
  value?: TValue;
  options: TOption[];
  optionKeyFn?: (option: TOption) => Key;
  optionNameFn?: (option: TOption) => string;
  optionValueFn?: (option: TOption) => TValue;
  variant?: RadioVariant;
  colorScheme?: RadioColorScheme;
  py?: number;
  vertical?: boolean;
  showButtons?: boolean;
  onChange?: (value: TValue) => void;
  onOptionClick?: (value: TValue) => void;
}

export interface RadioOption<TValue> {
  name: string;
  value: TValue;
}

const Radio = <TValue, TOption = RadioOption<TValue>>({
  name,
  value,
  options,
  optionKeyFn = getDefaultOptionKey,
  optionNameFn = getDefaultOptionName,
  optionValueFn = getDefaultOptionValue,
  variant = "normal",
  colorScheme = "default",
  vertical = false,
  showButtons = false,
}: RadioProps<TValue, TOption>): JSX.Element => {
  const RadioList = getListVariant(variant);

  return (
    <RadioList vertical={vertical} showButtons={showButtons}>
      {options.map(option => {
        const optionKey = optionKeyFn(option);
        const optionName = optionNameFn(option);
        const optionValue = optionValueFn(option);
        const optionChecked = value === optionValue;

        return (
          <RadioLabel key={optionKey}>
            <RadioInput type="radio" name={name} checked={optionChecked} />
            <RadioItem>
              <RadioButton checked={optionChecked} colorScheme={colorScheme} />
              <RadioText>{optionName}</RadioText>
            </RadioItem>
          </RadioLabel>
        );
      })}
    </RadioList>
  );
};

const getListVariant = (
  variant: RadioVariant,
): ComponentType<RadioListProps> => {
  switch (variant) {
    case "normal":
      return RadioNormalList;
    case "underlined":
      return RadioUnderlinedList;
    case "bubble":
      return RadioBubbleList;
  }
};

const getDefaultOptionKey = <TValue, TOption>(option: TOption): Key => {
  if (isDefaultOption<TValue>(option)) {
    return String(option.value);
  } else {
    throw new TypeError();
  }
};

const getDefaultOptionName = <TValue, TOption>(option: TOption): string => {
  if (isDefaultOption<TValue>(option)) {
    return option.name;
  } else {
    throw new TypeError();
  }
};

const getDefaultOptionValue = <TValue, TOption>(option: TOption): TValue => {
  if (isDefaultOption<TValue>(option)) {
    return option.value;
  } else {
    throw new TypeError();
  }
};

function isDefaultOption<TValue>(
  option: unknown,
): option is RadioOption<TValue> {
  return typeof option === "object";
}

export default Radio;
