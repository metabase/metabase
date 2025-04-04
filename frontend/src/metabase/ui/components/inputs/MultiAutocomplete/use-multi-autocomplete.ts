import { type ComboboxItem, useCombobox } from "@mantine/core";
import { parse } from "csv-parse/browser/esm/sync";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
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

  const setFieldState = ({ fieldValue, fieldSelection }: FieldState) => {
    setFieldValue(fieldValue);
    setFieldSelection(fieldSelection);
    onSearchChange?.(fieldValue);
  };

  const handleFieldInput = (
    newFieldValue: string,
    newParsedValues: string[],
  ) => {
    const newFieldValues = getUniqueFieldValues(
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
      newFieldValues,
      fieldSelection,
    );
    setFieldState(newFieldState);
  };

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newFieldValue = event.target.value;
    const newParsedValues = parseCsv(newFieldValue);
    handleFieldInput(newFieldValue, newParsedValues);
  };

  const handleFieldPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const newFieldValue = event.clipboardData.getData("text");
    const newParsedValues = parseCsv(newFieldValue);
    if (newParsedValues.length > 1) {
      event.preventDefault();
      handleFieldInput(newFieldValue, newParsedValues);
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
    combobox.closeDropdown();
    setFieldState({
      fieldValue: "",
      fieldSelection: undefined,
    });
  };

  const handlePillClick = (valueIndex: number) => {
    setFieldState({
      fieldValue: escapeCsv(values[valueIndex]),
      fieldSelection: { index: valueIndex, length: 1 },
    });
  };

  const handlePillRemoveClick = (valueIndex: number) => {
    const newValues = [...values];
    newValues.splice(valueIndex, 1);
    onChange(newValues);
    setFieldState({
      fieldValue: "",
      fieldSelection: undefined,
    });
  };

  const handlePillsInputClick = (event: MouseEvent<HTMLDivElement>) => {
    combobox.openDropdown();

    if (!(event.target instanceof HTMLInputElement)) {
      setFieldState({
        fieldValue: "",
        fieldSelection: undefined,
      });
    }
  };

  const handleOptionSubmit = (value: string) => {
    const newFieldValues = getUniqueFieldValues(
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
    pillValues: getPillValues(values, options, fieldSelection),
    filteredOptions: getFilteredOptions(options, values),
    fieldValue,
    handleFieldChange,
    handleFieldPaste,
    handleFieldKeyDown,
    handleFieldFocus,
    handleFieldBlur,
    handlePillClick,
    handlePillRemoveClick,
    handlePillsInputClick,
    handleOptionSubmit,
  };
}

function getPillValues(
  values: string[],
  options: ComboboxItem[],
  fieldSelection: FieldSelection,
) {
  const optionByValue = Object.fromEntries(
    options.map((option) => [option.value, option]),
  );
  const mappedValues = values.map(
    (value) => optionByValue[value]?.label ?? value,
  );
  return getValuesAfterChange(
    mappedValues,
    [FIELD_PLACEHOLDER],
    fieldSelection,
  );
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function getFilteredOptions(options: ComboboxItem[], values: string[]) {
  const usedValues = new Set(values.map(normalizeValue));
  return options.reduce((newOptions: ComboboxItem[], option) => {
    const normalizedValue = normalizeValue(option.value);
    if (!usedValues.has(normalizedValue)) {
      newOptions.push(option);
      usedValues.add(normalizedValue);
    }
    return newOptions;
  }, []);
}

function getUniqueFieldValues(
  values: string[],
  fieldValues: string[],
  fieldSelection: FieldSelection,
) {
  const startValues = values.slice(0, fieldSelection.index);
  const endValues = values.slice(fieldSelection.index + fieldSelection.length);
  const unchangedValues = new Set([...startValues, ...endValues]);
  return fieldValues.filter((value) => !unchangedValues.has(value));
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
  fieldValues: string[],
  fieldSelection: FieldSelection,
) {
  const isDelimiter = DELIMITERS.some((delimiter) =>
    fieldValue.endsWith(delimiter),
  );

  if (fieldValues.length > 1 || (isDelimiter && fieldValues.length > 0)) {
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
