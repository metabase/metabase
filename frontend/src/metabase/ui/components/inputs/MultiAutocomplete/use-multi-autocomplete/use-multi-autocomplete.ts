import {
  type ComboboxData,
  type ComboboxItem,
  type ComboboxParsedItem,
  getParsedComboboxData,
  isOptionsGroup,
  useCombobox,
} from "@mantine/core";
import { useWindowEvent } from "@mantine/hooks";
import { parse } from "csv-parse/browser/esm/sync";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useMemo,
  useState,
} from "react";

const DELIMITERS = [",", "\t", "\n"];
const QUOTE_CHAR = '"';
const ESCAPE_CHAR = "\\";
const QUOTED_CHARS = /["\\,]/;
const ESCAPED_CHARS = /["\\]/g;
const FIELD_PLACEHOLDER = null;

type UseMultiAutocompleteProps = {
  values: string[];
  data: ComboboxData;
  dropdownOpened?: boolean;
  defaultDropdownOpened?: boolean;
  selectFirstOptionOnChange?: boolean;
  parseValue: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
  onSearchChange?: (newValue: string) => void;
  onDropdownOpen?: () => void;
  onDropdownClose?: () => void;
  onOptionSubmit?: (value: string) => void;
};

type FieldState = {
  fieldValue: string;
  fieldSelection?: FieldSelection;
  fieldMinWidth?: number;
};

type FieldSelection = {
  index: number;
  length: number;
};

export function useMultiAutocomplete({
  values,
  data,
  dropdownOpened,
  defaultDropdownOpened,
  parseValue,
  onChange,
  onSearchChange,
  onDropdownOpen,
  onDropdownClose,
  onOptionSubmit,
}: UseMultiAutocompleteProps) {
  const combobox = useCombobox({
    opened: dropdownOpened,
    defaultOpened: defaultDropdownOpened,
    onDropdownOpen,
    onDropdownClose: () => {
      onDropdownClose?.();
      combobox.resetSelectedOption();
    },
  });
  const [fieldValue, setFieldValue] = useState("");
  const [_fieldSelection, setFieldSelection] = useState<FieldSelection>();
  const [fieldMinWidth, setFieldMinWidth] = useState<number>();
  const fieldSelection = _fieldSelection ?? { index: values.length, length: 0 };
  const searchValue = useMemo(() => getSearchValue(fieldValue), [fieldValue]);
  const options = useMemo(() => getParsedComboboxData(data), [data]);

  const setFieldState = ({
    fieldValue,
    fieldSelection,
    fieldMinWidth,
  }: FieldState) => {
    setFieldValue(fieldValue);
    setFieldSelection(fieldSelection);
    setFieldMinWidth(fieldMinWidth);

    const newSearchValue = getSearchValue(fieldValue);
    onSearchChange?.(newSearchValue);
  };

  const resetFieldState = () => {
    setFieldState({ fieldValue: "" });
  };

  const handleFieldInput = (
    newFieldValue: string,
    newParsedValues: string[],
  ) => {
    const newFieldValues = getFieldValuesWithoutDuplicates(
      values,
      newParsedValues.map(parseValue).filter(isNotNullish),
      fieldSelection,
    );
    const newValues = getValuesAfterChange(
      values,
      newFieldValues,
      fieldSelection,
    );
    onChange(newValues);
    const newFieldState = getFieldStateAfterChange(
      newFieldValue,
      newParsedValues,
      newFieldValues,
      fieldSelection,
    );
    setFieldState(newFieldState);
    combobox.openDropdown();
  };

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newFieldValue = event.target.value;
    const newParsedValues = parseCsv(newFieldValue);
    handleFieldInput(newFieldValue, newParsedValues);
  };

  const handleFieldPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    const clipboardData = event.clipboardData.getData("text");
    const newParsedValues = parseCsv(clipboardData);

    if (newParsedValues.length > 1) {
      event.preventDefault();
      const newFieldValue = "";
      const newParsedValuesWithFieldValue =
        getParsedValuesCombinedWithFieldValue(
          fieldValue,
          newParsedValues,
          selectionStart,
          selectionEnd,
        );
      handleFieldInput(newFieldValue, newParsedValuesWithFieldValue);
    }
  };

  const handleFieldKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (
      event.key === "Enter" &&
      !event.nativeEvent.isComposing &&
      combobox.selectedOptionIndex < 0 &&
      fieldSelection.length > 0
    ) {
      event.preventDefault();
      resetFieldState();
    }

    if (
      event.key === "Backspace" &&
      fieldValue.length === 0 &&
      fieldSelection.index > 0 &&
      fieldSelection.length === 0
    ) {
      const newValues = [...values];
      newValues.splice(fieldSelection.index - 1, 1);
      onChange(newValues);
      setFieldState({
        fieldValue: "",
        fieldSelection: {
          index: fieldSelection.index - 1,
          length: 0,
        },
      });
    }
  };

  const handleFieldFocus = () => {
    combobox.openDropdown();
  };

  const handleFieldBlur = () => {
    resetFieldState();
    combobox.closeDropdown();
  };

  const handlePillClick = (
    event: MouseEvent<HTMLDivElement>,
    valueIndex: number,
  ) => {
    const selectedValue = values[valueIndex];
    const pillRect = event.currentTarget.getBoundingClientRect();

    setFieldState({
      fieldValue: escapeCsv(selectedValue),
      fieldSelection: { index: valueIndex, length: 1 },
      fieldMinWidth: pillRect.width,
    });
  };

  const handlePillRemoveClick = (valueIndex: number) => {
    const newValues = [...values];
    newValues.splice(valueIndex, 1);
    onChange(newValues);
    resetFieldState();
  };

  const handlePillGroupClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      resetFieldState();
    }
  };

  const handlePillsInputClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      resetFieldState();
    }
    combobox.openDropdown();
  };

  const handleOptionSubmit = (value: string) => {
    const newFieldValues = getFieldValuesWithoutDuplicates(
      values,
      [value],
      fieldSelection,
    );
    const newValues = getValuesAfterChange(
      values,
      newFieldValues,
      fieldSelection,
    );
    const newFieldSelection = {
      index: fieldSelection.index + newFieldValues.length,
      length: 0,
    };
    const newFilteredOptions = getOptionsWithoutDuplicates(
      newValues,
      options,
      newFieldSelection,
    );

    setFieldSelection(newFieldSelection);
    if (newFilteredOptions.length === 0) {
      setFieldValue("");
      combobox.closeDropdown();
      combobox.resetSelectedOption();
    }
    onChange(newValues);
    onOptionSubmit?.(value);
  };

  const handleWindowKeydownCapture = (event: KeyboardEvent) => {
    if (event.isComposing) {
      return;
    }
    if (event.key === "Escape" && combobox.dropdownOpened) {
      event.stopImmediatePropagation();
      combobox.closeDropdown();
    }
  };

  useWindowEvent("keydown", handleWindowKeydownCapture, { capture: true });

  return {
    combobox,
    pillValues: getPillValues(values, fieldSelection),
    filteredOptions: getOptionsWithoutDuplicates(
      values,
      options,
      fieldSelection,
    ),
    fieldValue,
    fieldMinWidth,
    searchValue,
    handleFieldChange,
    handleFieldPaste,
    handleFieldKeyDown,
    handleFieldFocus,
    handleFieldBlur,
    handlePillClick,
    handlePillRemoveClick,
    handlePillGroupClick,
    handlePillsInputClick,
    handleOptionSubmit,
  };
}

function getSearchValue(fieldValue: string) {
  const parsedValues = parseCsv(fieldValue);
  return parsedValues.length === 1 ? parsedValues[0] : fieldValue;
}

function getPillValues(values: string[], fieldSelection: FieldSelection) {
  return getValuesAfterChange(values, [FIELD_PLACEHOLDER], fieldSelection);
}

function getValuesNotInSelection(
  values: string[],
  fieldSelection: FieldSelection,
) {
  const startValues = values.slice(0, fieldSelection.index);
  const endValues = values.slice(fieldSelection.index + fieldSelection.length);
  return [...startValues, ...endValues];
}

function getOptionsWithoutDuplicates(
  values: string[],
  options: ComboboxParsedItem[],
  fieldSelection: FieldSelection,
) {
  const usedValues = new Set(getValuesNotInSelection(values, fieldSelection));
  const newOptions: ComboboxParsedItem[] = [];

  for (const option of options) {
    if (isOptionsGroup(option)) {
      const newGroupOptions: ComboboxItem[] = [];
      for (const groupOption of option.items) {
        if (!usedValues.has(groupOption.value)) {
          newGroupOptions.push(groupOption);
          usedValues.add(groupOption.value);
        }
      }
      if (newGroupOptions.length > 0) {
        newOptions.push({ ...option, items: newGroupOptions });
      }
    } else if (!usedValues.has(option.value)) {
      newOptions.push(option);
      usedValues.add(option.value);
    }
  }

  return newOptions;
}

function getFieldValuesWithoutDuplicates(
  values: string[],
  fieldValues: string[],
  fieldSelection: FieldSelection,
) {
  const usedValues = new Set(getValuesNotInSelection(values, fieldSelection));
  return fieldValues.reduce((fieldValues: string[], value) => {
    if (!usedValues.has(value)) {
      fieldValues.push(value);
      usedValues.add(value);
    }
    return fieldValues;
  }, []);
}

function getValuesAfterChange<T>(
  values: T[],
  fieldValues: T[],
  fieldSelection: FieldSelection,
) {
  const startValues = values.slice(0, fieldSelection.index);
  const endValues = values.slice(fieldSelection.index + fieldSelection.length);
  return [...startValues, ...fieldValues, ...endValues];
}

function getFieldStateAfterChange(
  fieldValue: string,
  parsedValues: string[],
  fieldValues: string[], // `parsedValues` with duplicates and invalid values removed
  fieldSelection: FieldSelection,
) {
  const isDelimiter = DELIMITERS.some((delimiter) =>
    fieldValue.endsWith(delimiter),
  );

  // Reset the input state when there is a delimiter and some parsed values,
  // even if all of them are rejected by validation. Parsed values are taken
  // into account to allow entering values when the delimiter is escaped; in
  // this case it will be an empty array until there is a closing quote.
  //
  // When the new input value contains multiple values, we reset the input state
  // immediately. It can happen both with copy-pasting and regular input. With
  // regular input, the user can enter "abc" and then "ab,c"; in this case "abc"
  // will be replaced by the 2 new values.
  if ((isDelimiter && parsedValues.length > 0) || parsedValues.length > 1) {
    return {
      fieldValue: "",
      fieldSelection: {
        index: fieldSelection.index + fieldValues.length,
        length: 0,
      },
    };
  } else {
    return {
      fieldValue,
      fieldSelection: {
        index: fieldSelection.index,
        length: fieldValues.length > 0 ? 1 : 0,
      },
    };
  }
}

// When pasting, we want to combine the values from the clipboard with the
// existing input value, taking the current selection into account. For example,
// if the input value is "ab<caret>c" and the user pastes "d,e,f", the
// new values should be "abd,e,fc". | codespell:ignore
function getParsedValuesCombinedWithFieldValue(
  fieldValue: string,
  parsedValues: string[],
  selectionStart: number | null,
  selectionEnd: number | null,
) {
  const prefix =
    selectionStart != null && selectionStart > 0
      ? fieldValue.substring(0, selectionStart)
      : "";
  const suffix =
    selectionEnd != null && selectionEnd < fieldValue.length
      ? fieldValue.substring(selectionEnd)
      : "";

  return [
    `${prefix}${parsedValues[0]}`,
    ...parsedValues.slice(1, parsedValues.length - 1),
    `${parsedValues[parsedValues.length - 1]}${suffix}`,
  ];
}

function parseCsv(rawValue: string): string[] {
  try {
    return parse(rawValue, {
      delimiter: DELIMITERS,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      quote: QUOTE_CHAR,
      escape: ESCAPE_CHAR,
    }).flat();
  } catch (err) {
    return [];
  }
}

function escapeCsv(value: string): string {
  if (QUOTED_CHARS.test(value)) {
    return `${QUOTE_CHAR}${value.replaceAll(ESCAPED_CHARS, (s) => `${ESCAPE_CHAR}${s}`)}${QUOTE_CHAR}`;
  }
  return value;
}

function isNotNullish<T>(value: T | null): value is T {
  return value != null;
}
