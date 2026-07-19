import {
  type ComboboxStringData,
  getLabelsLockup,
  getOptionsLockup,
  getParsedComboboxData,
  isOptionsGroup,
  useCombobox,
} from "@mantine/core";
import {
  type ChangeEvent,
  type FocusEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrevious } from "react-use";

type UseAutocompleteProps = {
  value?: string;
  defaultValue?: string;
  data?: ComboboxStringData;
  selectFirstOptionOnChange?: boolean;
  autoSelectOnBlur?: boolean;
  openOnFocus?: boolean;
  parseValue: (rawValue: string) => string | null;
  onChange?: (value: string) => void;
  onSearchChange?: (rawValue: string) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onClick?: (event: MouseEvent<HTMLInputElement>) => void;
  onDropdownOpen?: () => void;
  onDropdownClose?: () => void;
  onOptionSubmit?: (value: string) => void;
};

export const useAutocomplete = ({
  value,
  defaultValue,
  data,
  selectFirstOptionOnChange,
  autoSelectOnBlur,
  openOnFocus = true,
  parseValue,
  onChange,
  onSearchChange,
  onFocus,
  onBlur,
  onClick,
  onDropdownOpen,
  onDropdownClose,
  onOptionSubmit,
}: UseAutocompleteProps) => {
  const parsedData = useMemo(() => getParsedComboboxData(data), [data]);
  const optionsKey = useMemo(
    () =>
      parsedData
        .flatMap((item) => (isOptionsGroup(item) ? item.items : item))
        .map((item) => item.value)
        .join(" "),
    [parsedData],
  );
  const { valueLockup, labelLockup } = useMemo(
    () => ({
      valueLockup: getOptionsLockup(parsedData),
      labelLockup: getLabelsLockup(parsedData),
    }),
    [parsedData],
  );

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

  const combobox = useCombobox({
    onDropdownOpen,
    onDropdownClose: () => {
      onDropdownClose?.();
      combobox.resetSelectedOption();
    },
  });

  useEffect(() => {
    if (value === previousValue) {
      return;
    }
    if (resolveValue(inputValue) !== value) {
      setInputValue(formatValue(value ?? ""));
    }
  }, [value, previousValue, inputValue, resolveValue, formatValue]);

  useEffect(() => {
    if (selectFirstOptionOnChange && combobox.dropdownOpened) {
      combobox.selectFirstOption();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey, selectFirstOptionOnChange]);

  const handleSearchChange = (rawValue: string) => {
    setInputValue(rawValue);
    onSearchChange?.(rawValue);
    onChange?.(resolveValue(rawValue));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleSearchChange(event.currentTarget.value);
    combobox.openDropdown();
    if (selectFirstOptionOnChange) {
      combobox.selectFirstOption();
    }
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    if (openOnFocus) {
      combobox.openDropdown();
    }
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (autoSelectOnBlur) {
      combobox.clickSelectedOption();
    }
    combobox.closeDropdown();
    onBlur?.(event);
  };

  const handleClick = (event: MouseEvent<HTMLInputElement>) => {
    combobox.openDropdown();
    onClick?.(event);
  };

  const handleOptionSubmit = (optionValue: string) => {
    onOptionSubmit?.(optionValue);
    handleSearchChange(formatValue(optionValue));
    combobox.closeDropdown();
  };

  return {
    combobox,
    parsedData,
    inputValue,
    handleInputChange,
    handleFocus,
    handleBlur,
    handleClick,
    handleOptionSubmit,
  };
};
