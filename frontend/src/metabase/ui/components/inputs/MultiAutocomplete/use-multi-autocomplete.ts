import { type ComboboxItem, useCombobox } from "@mantine/core";
import { parse } from "csv-parse/browser/esm/sync";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  useMemo,
  useState,
} from "react";

const DELIMITERS = [",", "\t", "\n"];
const QUOTE_CHAR = '"';
const ESCAPE_CHAR = "\\";
const SPECIAL_CHARS_REGEX = /[,\t\n"\\]/g;
const FIELD_PLACEHOLDER = null;

type UseMultiAutocompleteProps = {
  values: string[];
  options: ComboboxItem[];
  shouldCreate?: (newValue: string) => boolean;
  onChange: (newValues: string[]) => void;
  onSearchChange?: (newValue: string) => void;
};

type FieldState = {
  fieldValue: string;
  fieldSelection: FieldSelection | undefined;
};

type FieldSelection = {
  index: number;
  length: number;
};

export function useMultiAutocomplete({
  values,
  options,
  shouldCreate = defaultShouldCreate,
  onChange,
  onSearchChange,
}: UseMultiAutocompleteProps) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [fieldValue, setFieldValue] = useState("");
  const [_fieldSelection, setFieldSelection] = useState<FieldSelection>();
  const fieldSelection = _fieldSelection ?? { index: values.length, length: 0 };
  const optionByValue = useMemo(() => getOptionByValue(options), [options]);

  const setFieldState = ({ fieldValue, fieldSelection }: FieldState) => {
    setFieldValue(fieldValue);
    setFieldSelection(fieldSelection);
    onSearchChange?.(fieldValue);
  };

  const resetFieldState = () => {
    setFieldState({
      fieldValue: "",
      fieldSelection: undefined,
    });
  };

  const handleFieldInput = (
    newFieldValue: string,
    newParsedValues: string[],
  ) => {
    const newFieldValues = getFieldValuesNotInSelection(
      values,
      newParsedValues.filter(shouldCreate),
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

  const handleFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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

  const handlePillClick = (valueIndex: number) => {
    const newValue = values[valueIndex];
    setFieldState({
      fieldValue: escapeCsv(newValue),
      fieldSelection: { index: valueIndex, length: 1 },
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
    const newFieldValues = getFieldValuesNotInSelection(
      values,
      [value],
      fieldSelection,
    );
    const newValues = getValuesAfterChange(
      values,
      newFieldValues,
      fieldSelection,
    );
    onChange(newValues);
    setFieldState({
      fieldValue: "",
      fieldSelection: {
        index: fieldSelection.index + newFieldValues.length,
        length: 0,
      },
    });
    combobox.closeDropdown();
    combobox.resetSelectedOption();
  };

  return {
    combobox,
    pillValues: getPillValues(values, optionByValue, fieldSelection),
    filteredOptions: getFilteredOptions(values, options, fieldSelection),
    fieldValue,
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

function getOptionByValue(options: ComboboxItem[]) {
  return Object.fromEntries(options.map((option) => [option.value, option]));
}

function getPillValues(
  values: string[],
  optionByValue: Record<string, ComboboxItem>,
  fieldSelection: FieldSelection,
) {
  const mappedValues = values.map(
    (value) => optionByValue[value]?.label ?? value,
  );
  return getValuesAfterChange(
    mappedValues,
    [FIELD_PLACEHOLDER],
    fieldSelection,
  );
}

function getFilteredOptions(
  values: string[],
  options: ComboboxItem[],
  fieldSelection: FieldSelection,
) {
  const usedValues = new Set(getValuesNotInSelection(values, fieldSelection));
  return options.reduce((options: ComboboxItem[], option) => {
    if (!usedValues.has(option.value)) {
      options.push(option);
      usedValues.add(option.value);
    }
    return options;
  }, []);
}

function getValuesNotInSelection(
  values: string[],
  fieldSelection: FieldSelection,
) {
  const startValues = values.slice(0, fieldSelection.index);
  const endValues = values.slice(fieldSelection.index + fieldSelection.length);
  return [...startValues, ...endValues];
}

function getFieldValuesNotInSelection(
  values: string[],
  fieldValues: string[],
  fieldSelection: FieldSelection,
) {
  const usedValues = new Set(getValuesNotInSelection(values, fieldSelection));
  return fieldValues.filter((value) => !usedValues.has(value));
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

  // we want to reset the input state when there is a delimiter and some parsed
  // values, even if all of them are rejected by validation
  if (parsedValues.length > 1 || (isDelimiter && parsedValues.length > 0)) {
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
  if (SPECIAL_CHARS_REGEX.test(value)) {
    return `${QUOTE_CHAR}${value.replaceAll(SPECIAL_CHARS_REGEX, (s) => `${ESCAPE_CHAR}${s}`)}${QUOTE_CHAR}`;
  }
  return value;
}

function defaultShouldCreate(value: string) {
  return value.trim().length > 0;
}
