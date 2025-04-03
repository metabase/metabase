import { useCombobox } from "@mantine/core";
import { parse } from "csv-parse/browser/esm/sync";
import { type ChangeEvent, type KeyboardEvent, useState } from "react";

const DELIMITERS = [",", "\t", "\n"];
const QUOTE_CHAR = '"';
const ESCAPE_CHAR = "\\";
const SPECIAL_CHARS_REGEX = /[,\t\n"\\]/g;
const FIELD_PLACEHOLDER = null;

type UseMultiAutocompleteProps = {
  values: string[];
  shouldCreate?: (newValue: string) => boolean;
  onChange: (newValues: string[]) => void;
  onSearchChange?: (newValue: string) => void;
};

type FieldState = {
  fieldValue: string;
  fieldSelection: FieldSelection;
};

type FieldSelection = {
  index: number;
  length: number;
};

export function useMultiAutocomplete({
  values,
  shouldCreate = defaultShouldCreate,
  onChange,
  onSearchChange,
}: UseMultiAutocompleteProps) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [isFocused, setIsFocused] = useState(false);
  const [fieldValue, setFieldValue] = useState("");
  const [fieldSelection, setFieldSelection] = useState<FieldSelection>({
    index: values.length,
    length: 0,
  });

  const setFieldState = ({ fieldValue, fieldSelection }: FieldState) => {
    setFieldValue(fieldValue);
    setFieldSelection(fieldSelection);
    onSearchChange?.(fieldValue);
  };

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    const parsedValues = parseCsv(rawValue).filter(shouldCreate);
    const newValues = getValuesAfterChange(
      values,
      parsedValues,
      fieldSelection,
    );
    onChange(newValues);
    const newFieldState = getFieldStateAfterChange(
      fieldSelection,
      rawValue,
      parsedValues,
    );
    setFieldState(newFieldState);
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
          index: fieldSelection.index + fieldSelection.length - 1,
          length: 0,
        },
      });
    }
  };

  const handleFieldFocus = () => {
    combobox.openDropdown();
    setIsFocused(true);
    setFieldSelection({ index: values.length, length: 0 });
  };

  const handleFieldBlur = () => {
    combobox.closeDropdown();
    setIsFocused(false);
    setFieldState({
      fieldValue: "",
      fieldSelection: { index: values.length, length: 0 },
    });
  };

  const handlePillDoubleClick = (valueIndex: number) => {
    setFieldState({
      fieldValue: formatCsv(values[valueIndex]),
      fieldSelection: { index: valueIndex, length: 1 },
    });
  };

  const handlePillRemoveClick = (valueIndex: number) => {
    const newValues = [...values];
    newValues.splice(valueIndex, 1);
    onChange(newValues);
    setFieldState({
      fieldValue: "",
      fieldSelection: {
        index: newValues.length,
        length: 0,
      },
    });
  };

  const handleOptionSubmit = (value: string) => {
    const newValues = getValuesAfterChange(values, [value], fieldSelection);
    onChange(newValues);
    setFieldState({
      fieldValue: "",
      fieldSelection: {
        index: fieldSelection.index + fieldSelection.length,
        length: 0,
      },
    });
  };

  return {
    combobox,
    pillValues: getValuesAfterChange(
      values,
      [FIELD_PLACEHOLDER],
      fieldSelection,
    ),
    fieldValue,
    isFocused,
    handleFieldChange,
    handleFieldKeyDown,
    handleFieldFocus,
    handleFieldBlur,
    handlePillDoubleClick,
    handlePillRemoveClick,
    handleOptionSubmit,
  };
}

function getValuesAfterChange<T>(
  values: T[],
  parsedValues: T[],
  fieldSelection: FieldSelection,
) {
  return [
    ...values.slice(0, fieldSelection.index),
    ...parsedValues,
    ...values.slice(fieldSelection.index + fieldSelection.length),
  ];
}

function getFieldStateAfterChange(
  fieldSelection: FieldSelection,
  fieldValue: string,
  parsedValues: string[],
) {
  const isDelimiter = DELIMITERS.some((delimiter) =>
    fieldValue.endsWith(delimiter),
  );

  if (parsedValues.length > 1 || (isDelimiter && parsedValues.length > 0)) {
    return {
      fieldValue: "",
      fieldSelection: {
        index: fieldSelection.index + parsedValues.length,
        length: 0,
      },
    };
  } else {
    return {
      fieldValue,
      fieldSelection: {
        index: fieldSelection.index,
        length: parsedValues.length > 0 ? 1 : 0,
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

function formatCsv(value: string): string {
  if (SPECIAL_CHARS_REGEX.test(value)) {
    return `${QUOTE_CHAR}${value.replaceAll(SPECIAL_CHARS_REGEX, (s) => `${ESCAPE_CHAR}${s}`)}${QUOTE_CHAR}`;
  }
  return value;
}

function defaultShouldCreate(value: string) {
  return value.trim().length > 0;
}
