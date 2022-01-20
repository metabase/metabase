import React, { Key } from "react";
import { RadioColorScheme, RadioVariant } from "./types";

export interface RadioProps<TValue, TOption = RadioOption<TValue>> {
  name?: string;
  value?: TValue;
  options: TOption[];
  variant?: RadioVariant;
  colorScheme?: RadioColorScheme;
  optionNameFn?: (option: TOption) => string;
  optionValueFn?: (option: TOption) => TValue;
  optionKeyFn?: (option: TOption) => Key;
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
  variant = "normal",
  colorScheme = "default",
  optionNameFn = getDefaultOptionName,
  optionValueFn = getDefaultOptionValue,
  optionKeyFn = getDefaultOptionKey,
}: RadioProps<TValue, TOption>): JSX.Element {
  return <div />;
}

function getDefaultOptionName<TValue, TOption>(option: TOption): string {
  assertDefaultOption<TValue>(option);
  return option.name;
}

function getDefaultOptionValue<TValue, TOption>(option: TOption): TValue {
  assertDefaultOption<TValue>(option);
  return option.value;
}

function getDefaultOptionKey<TValue, TOption>(option: TOption): Key {
  assertDefaultOption(option);
  return String(option.value);
}

function assertDefaultOption<TValue>(
  option: unknown,
): asserts option is RadioOption<TValue> {
  if (typeof option !== "object") {
    throw new TypeError();
  }
}
