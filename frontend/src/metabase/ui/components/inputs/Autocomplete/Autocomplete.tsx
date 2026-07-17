import {
  Autocomplete as MantineAutocomplete,
  type AutocompleteProps as MantineAutocompleteProps,
  getLabelsLockup,
  getOptionsLockup,
  getParsedComboboxData,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";

export type AutocompleteProps = Omit<MantineAutocompleteProps, "onChange"> & {
  parseValue?: (rawValue: string) => string | null;
  onChange?: (value: string) => void;
  onSearchChange?: (rawValue: string) => void;
};

const defaultParseValue = (rawValue: string) => {
  const trimmedValue = rawValue.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

export const Autocomplete = ({
  value,
  defaultValue,
  data,
  parseValue = defaultParseValue,
  onChange,
  onSearchChange,
  ...props
}: AutocompleteProps) => {
  const { valueLockup, labelLockup } = useMemo(() => {
    const parsed = getParsedComboboxData(data);
    return {
      valueLockup: getOptionsLockup(parsed),
      labelLockup: getLabelsLockup(parsed),
    };
  }, [data]);

  const formatValue = useCallback(
    (rawValue: string) => valueLockup[rawValue]?.label ?? rawValue,
    [valueLockup],
  );

  const resolveValue = useCallback(
    (rawValue: string) => {
      const match = valueLockup[rawValue] ?? labelLockup[rawValue];
      return match?.value ?? parseValue(rawValue) ?? "";
    },
    [valueLockup, labelLockup, parseValue],
  );

  const [inputValue, setInputValue] = useState(() =>
    formatValue(value ?? defaultValue ?? ""),
  );
  const previousValue = usePrevious(value);

  useEffect(() => {
    if (value === previousValue) {
      return;
    }
    if (resolveValue(inputValue) !== value) {
      setInputValue(formatValue(value ?? ""));
    }
  }, [value, previousValue, inputValue, resolveValue, formatValue]);

  const handleChange = (rawValue: string) => {
    setInputValue(rawValue);
    onSearchChange?.(rawValue);
    onChange?.(resolveValue(rawValue));
  };

  return (
    <MantineAutocomplete
      value={inputValue}
      data={data}
      onChange={handleChange}
      {...props}
    />
  );
};
