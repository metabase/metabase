import {
  Combobox,
  type ComboboxItem,
  OptionsDropdown,
  Pill,
  PillsInput,
  useCombobox,
} from "@mantine/core";
import { parse } from "csv-parse/browser/esm/sync";
import { type ChangeEvent, type KeyboardEvent, useState } from "react";

export type MultiAutocompleteProps = {
  values: string[];
  options: ComboboxItem[];
  placeholder?: string;
  shouldCreate?: (value: string) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
};

export function MultiAutocomplete({
  values,
  options,
  placeholder,
  shouldCreate = defaultShouldCreate,
  autoFocus,
  onChange,
}: MultiAutocompleteProps) {
  const combobox = useCombobox();
  const {
    pillValues,
    fieldValue,
    handleFieldChange,
    handleFieldKeyDown,
    handleFieldFocus,
    handleFieldBlur,
    handlePillDoubleClick,
    handlePillRemoveClick,
  } = useMultiAutocomplete({ values, shouldCreate, onChange });

  return (
    <Combobox store={combobox}>
      <Combobox.DropdownTarget>
        <PillsInput>
          <Pill.Group>
            {pillValues.map((value, valueIndex) =>
              value !== FIELD_PLACEHOLDER ? (
                <Pill
                  key={valueIndex}
                  withRemoveButton
                  onDoubleClick={() => handlePillDoubleClick(valueIndex)}
                  onRemove={() => handlePillRemoveClick(valueIndex)}
                >
                  {value}
                </Pill>
              ) : (
                <Combobox.EventsTarget key="field">
                  <PillsInput.Field
                    value={fieldValue}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    onChange={handleFieldChange}
                    onKeyDown={handleFieldKeyDown}
                    onFocus={handleFieldFocus}
                    onBlur={handleFieldBlur}
                  />
                </Combobox.EventsTarget>
              ),
            )}
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>
      <OptionsDropdown
        data={options}
        filter={undefined}
        search={undefined}
        limit={undefined}
        withScrollArea={undefined}
        maxDropdownHeight={undefined}
        unstyled={false}
        labelId={undefined}
        aria-label={undefined}
        scrollAreaProps={undefined}
      />
    </Combobox>
  );
}

const DELIMITERS = [",", "\t", "\n"];
const QUOTE_CHAR = '"';
const ESCAPE_CHAR = "\\";
const SPECIAL_CHARS_REGEX = /[,\t\n"\\]/g;
const FIELD_PLACEHOLDER = null;

type UseMultiAutocompleteProps = {
  values: string[];
  shouldCreate: (newValue: string) => boolean;
  onChange: (newValues: string[]) => void;
};

type FieldSelection = {
  index: number;
  length: number;
};

function useMultiAutocomplete({
  values,
  shouldCreate,
  onChange,
}: UseMultiAutocompleteProps) {
  const [fieldValue, setFieldValue] = useState("");
  const [fieldSelection, setFieldSelection] = useState<FieldSelection>({
    index: values.length,
    length: 0,
  });

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    const parsedValues = parseCsv(rawValue).filter(shouldCreate);
    const newValues = getValuesAfterChange(
      values,
      parsedValues,
      fieldSelection,
    );
    const { fieldValue: newFieldValue, fieldSelection: newFieldSelection } =
      getFieldStateAfterChange(fieldSelection, rawValue, parsedValues);
    onChange(newValues);
    setFieldValue(newFieldValue);
    setFieldSelection(newFieldSelection);
  };

  const handleValueRemove = (
    valueIndex: number,
    { preserveSelection }: { preserveSelection: boolean },
  ) => {
    const newValues = [...values];
    newValues.splice(valueIndex, 1);
    onChange(newValues);
    setFieldValue("");
    setFieldSelection({
      index: preserveSelection
        ? fieldSelection.index + fieldSelection.length - 1
        : newValues.length,
      length: 0,
    });
  };

  const handleFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key === "Backspace" &&
      fieldValue.length === 0 &&
      fieldSelection.index > 0 &&
      fieldSelection.length === 0
    ) {
      handleValueRemove(fieldSelection.index - 1, { preserveSelection: true });
    }
  };

  const handleFieldFocus = () => {
    setFieldSelection({ index: values.length, length: 0 });
  };

  const handleFieldBlur = () => {
    setFieldValue("");
    setFieldSelection({ index: values.length, length: 0 });
  };

  const handlePillDoubleClick = (valueIndex: number) => {
    setFieldValue(formatCsv(values[valueIndex]));
    setFieldSelection({ index: valueIndex, length: 1 });
  };

  const handlePillRemoveClick = (valueIndex: number) => {
    handleValueRemove(valueIndex, { preserveSelection: false });
  };

  return {
    pillValues: getValuesAfterChange(
      values,
      [FIELD_PLACEHOLDER],
      fieldSelection,
    ),
    fieldValue,
    handleFieldChange,
    handleFieldKeyDown,
    handleFieldFocus,
    handleFieldBlur,
    handlePillDoubleClick,
    handlePillRemoveClick,
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
