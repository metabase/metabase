import React, { Key } from "react";
import { RadioColorScheme, RadioVariant } from "./types";
import {
  RadioButton,
  RadioContainer,
  RadioInput,
  RadioItem,
  RadioList,
  RadioText,
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
  disabled?: boolean;
  vertical?: boolean;
  showButtons?: boolean;
  py?: number;
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
  disabled = false,
  vertical = false,
  showButtons = false,
}: RadioProps<TValue, TOption>): JSX.Element => {
  return (
    <RadioList variant={variant} vertical={vertical} showButtons={showButtons}>
      {options.map(option => {
        const optionKey = optionKeyFn(option);
        const optionName = optionNameFn(option);
        const optionValue = optionValueFn(option);
        const optionChecked = value === optionValue;

        return (
          <RadioContainer key={optionKey} variant={variant} vertical={vertical}>
            <RadioInput type="radio" name={name} checked={optionChecked} />
            <RadioItem disabled={disabled}>
              <RadioButton checked={optionChecked} colorScheme={colorScheme} />
              <RadioText>{optionName}</RadioText>
            </RadioItem>
          </RadioContainer>
        );
      })}
    </RadioList>
  );
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
