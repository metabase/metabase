import React, { Key } from "react";
import { RadioColorScheme, RadioVariant } from "./types";
import {
  RadioButton,
  RadioContainer,
  RadioInput,
  RadioLabel,
  RadioRoot,
  RadioText,
} from "./Radio.styled";

export interface RadioProps<TValue, TOption = RadioOption<TValue>> {
  name?: string;
  value?: TValue;
  options: TOption[];
  variant?: RadioVariant;
  colorScheme?: RadioColorScheme;
  optionKeyFn?: (option: TOption) => Key;
  optionNameFn?: (option: TOption) => string;
  optionValueFn?: (option: TOption) => TValue;
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

function Radio<TValue, TOption = RadioOption<TValue>>({
  name,
  value,
  options,
  optionKeyFn = getDefaultOptionKey,
  optionNameFn = getDefaultOptionName,
  optionValueFn = getDefaultOptionValue,
}: RadioProps<TValue, TOption>): JSX.Element {
  return (
    <RadioRoot>
      {options.map(option => {
        const optionKey = optionKeyFn(option);
        const optionName = optionNameFn(option);
        const optionValue = optionValueFn(option);
        const optionChecked = value === optionValue;

        return (
          <RadioLabel key={optionKey}>
            <RadioInput type="radio" name={name} checked={optionChecked} />
            <RadioContainer>
              <RadioButton />
              <RadioText>{optionName}</RadioText>
            </RadioContainer>
          </RadioLabel>
        );
      })}
    </RadioRoot>
  );
}

function getDefaultOptionKey<TValue, TOption>(option: TOption): Key {
  assertDefaultOption(option);
  return String(option.value);
}

function getDefaultOptionName<TValue, TOption>(option: TOption): string {
  assertDefaultOption<TValue>(option);
  return option.name;
}

function getDefaultOptionValue<TValue, TOption>(option: TOption): TValue {
  assertDefaultOption<TValue>(option);
  return option.value;
}

function assertDefaultOption<TValue>(
  option: unknown,
): asserts option is RadioOption<TValue> {
  if (typeof option !== "object") {
    throw new TypeError();
  }
}
