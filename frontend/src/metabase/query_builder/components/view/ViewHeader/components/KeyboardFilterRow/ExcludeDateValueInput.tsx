import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import type {
  ExcludeOperatorOption,
  ExcludeUnitOption,
} from "metabase/querying/common/components/DatePicker/ExcludeDatePicker/types";
import {
  findExcludeUnitOption,
  getExcludeOperatorOptions,
  getExcludeOperatorValue,
  getExcludeUnitOptions,
  getExcludeUnitValue,
  getExcludeValueOptionGroups,
} from "metabase/querying/common/components/DatePicker/ExcludeDatePicker/utils";
import { DATE_PICKER_OPERATORS } from "metabase/querying/common/constants";
import type {
  DatePickerExtractionUnit,
  DatePickerUnit,
  DatePickerValue,
  ExcludeDatePickerOperator,
  ExcludeDatePickerValue,
} from "metabase/querying/common/types";
import { useSetting } from "metabase/settings";

import { SuggestionInput } from "./SuggestionInput";
import { ValueBox, ValueText, joinValueLabels } from "./ValueText";
import type { SuggestionGroup, SuggestionOption } from "./types";
import { SELECT_ALL_VALUE } from "./value-widgets";

const UNIT_PREFIX = "unit:";
const OPERATOR_PREFIX = "operator:";

interface ExcludeDateValueInputProps {
  availableUnits: DatePickerUnit[];
  value: DatePickerValue | undefined;
  onChange: (value: ExcludeDatePickerValue) => void;
  /** Goes back to the operators, like Backspace in an empty value input. */
  onBack: () => void;
  onCancel: () => void;
  /**
   * The value so far, or undefined when nothing is checked, so that a click
   * outside the pill applies it, like in the other lists of checkboxes.
   */
  onDraftChange: (value: ExcludeDatePickerValue | undefined) => void;
}

/**
 * Prototype: the "Exclude…" values of a date pill, as the lists of the other
 * pills: first the kinds of values ("Days of the week…", "Empty values"),
 * then a list of checkboxes. It replaces the exclude picker of the filter
 * picker, and keeps its options. The keys work like in a list of values:
 * Enter toggles the highlighted option or applies, Tab applies, Backspace in
 * the empty input goes back.
 */
export function ExcludeDateValueInput({
  availableUnits,
  value,
  onChange,
  onBack,
  onCancel,
  onDraftChange,
}: ExcludeDateValueInputProps) {
  const initialValue = value?.type === "exclude" ? value : undefined;
  const [unit, setUnit] = useState(initialValue?.unit);
  const [values, setValuesState] = useState(initialValue?.values ?? []);
  const [text, setText] = useState("");
  const formattingOptions = useSetting("custom-formatting");
  const unitOptions = useMemo(
    () => getExcludeUnitOptions(DATE_PICKER_OPERATORS, availableUnits),
    [availableUnits],
  );
  const operatorOptions = useMemo(
    () => getExcludeOperatorOptions(DATE_PICKER_OPERATORS),
    [],
  );

  const valueOptions = useMemo(
    () =>
      unit != null
        ? getExcludeValueOptionGroups(
            unit,
            formattingOptions["type/Temporal"],
          ).flat()
        : [],
    [unit, formattingOptions],
  );

  const updateValues = (
    newUnit: DatePickerExtractionUnit | undefined,
    newValues: number[],
  ) => {
    setValuesState(newValues);
    onDraftChange(
      newUnit != null && newValues.length > 0
        ? getExcludeUnitValue(newUnit, newValues)
        : undefined,
    );
  };
  const setValues = (newValues: number[]) => updateValues(unit, newValues);

  const selectUnit = (newUnit: DatePickerExtractionUnit | undefined) => {
    setUnit(newUnit);
    // Back to the values of the filter being edited, if it's the same kind.
    const isInitialUnit =
      initialValue != null && newUnit != null && newUnit === initialValue.unit;
    updateValues(newUnit, isInitialUnit ? initialValue.values : []);
    setText("");
  };

  // A pick clears the typed text, like in the other lists of checkboxes.
  const toggleValue = (key: string) => {
    setText("");
    if (key === SELECT_ALL_VALUE) {
      const isAllChecked = values.length === valueOptions.length;
      setValues(isAllChecked ? [] : valueOptions.map((option) => option.value));
      return;
    }
    const toggled = Number(key);
    setValues(
      values.includes(toggled)
        ? values.filter((value) => value !== toggled)
        : [...values, toggled],
    );
  };

  const apply = () => {
    if (unit != null && values.length > 0) {
      onChange(getExcludeUnitValue(unit, values));
    }
  };

  const handleOptionSubmit = (key: string) => {
    const unitOption = unitOptions.find(
      (option) => getUnitKey(option.unit) === key,
    );
    const operatorOption = operatorOptions.find(
      (option) => getOperatorKey(option.operator) === key,
    );
    if (unitOption != null) {
      selectUnit(unitOption.unit);
    } else if (operatorOption != null) {
      onChange(getExcludeOperatorValue(operatorOption.operator));
    } else {
      toggleValue(key);
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    hasSelectedOption: boolean,
    firstOptionValue: string | undefined,
  ) => {
    const isInputEmpty = text.length === 0;
    const isCaretAtStart =
      event.currentTarget.selectionStart === 0 &&
      event.currentTarget.selectionEnd === 0;
    switch (event.key) {
      case "Escape":
        onCancel();
        return true;
      case "Backspace":
        if (!isInputEmpty) {
          return false;
        }
        if (unit != null && values.length > 0) {
          setValues(values.slice(0, -1));
        } else if (unit != null) {
          selectUnit(undefined);
        } else {
          onBack();
        }
        return true;
      case "ArrowLeft":
        if (!isCaretAtStart) {
          return false;
        }
        if (unit != null) {
          selectUnit(undefined);
        } else {
          onBack();
        }
        return true;
      // In the list of checkboxes, like in the other lists of checkboxes, Tab
      // applies, or picks the first match of a typed text. Enter applies when
      // no option is highlighted.
      case "Tab":
        if (unit != null && isInputEmpty) {
          apply();
          return true;
        }
        if (unit != null && !hasSelectedOption && firstOptionValue != null) {
          toggleValue(firstOptionValue);
          return true;
        }
        return false;
      case "Enter":
        if (unit != null && !hasSelectedOption) {
          apply();
          return true;
        }
        return false;
      default:
        return false;
    }
  };

  const unitLabel =
    unit != null ? findExcludeUnitOption(unit)?.label.replace(/…$/, "") : null;
  const labels = new Map(
    valueOptions.map((option) => [option.value, option.label]),
  );

  const valueLabels = values.map((value) => labels.get(value) ?? String(value));

  return (
    <ValueBox
      contentKey={`${values.join("\n")}\n${text}`}
      fullText={joinValueLabels(valueLabels)}
    >
      <ValueText labels={valueLabels} hasTrailingSeparator />
      <SuggestionInput
        // A new list opens with each step, like a new step of the pill.
        key={unit ?? "units"}
        groups={
          unit != null
            ? getValueGroups(valueOptions, values)
            : getUnitGroups(unitOptions, operatorOptions, initialValue)
        }
        text={text}
        placeholder={
          values.length > 0 ? t`Add more` : (unitLabel ?? t`Exclude…`)
        }
        isMultiSelect={unit != null}
        isFirstOptionHighlighted={unit == null}
        onTextChange={setText}
        onOptionSubmit={handleOptionSubmit}
        onKeyDown={handleKeyDown}
      />
    </ValueBox>
  );
}

function getUnitKey(unit: DatePickerExtractionUnit) {
  return `${UNIT_PREFIX}${unit}`;
}

function getOperatorKey(operator: ExcludeDatePickerOperator) {
  return `${OPERATOR_PREFIX}${operator}`;
}

/**
 * The kinds of values to exclude, then "Empty values" and "Not empty values".
 * The kind or the operator of an existing filter is checked.
 */
function getUnitGroups(
  unitOptions: ExcludeUnitOption[],
  operatorOptions: ExcludeOperatorOption[],
  value: ExcludeDatePickerValue | undefined,
): SuggestionGroup[] {
  return [
    {
      options: unitOptions.map((option) => ({
        value: getUnitKey(option.unit),
        label: option.label,
        isChecked: option.unit === value?.unit,
      })),
    },
    {
      hasDivider: true,
      options: operatorOptions.map((option) => ({
        value: getOperatorKey(option.operator),
        label: option.label,
        isChecked: option.operator === value?.operator && value?.unit == null,
      })),
    },
  ].filter((group) => group.options.length > 0);
}

/**
 * "Select all", then the values, like the days of the week. A typed text
 * filters "Select all" too, like in the other lists of checkboxes.
 */
function getValueGroups(
  valueOptions: { value: number; label: string }[],
  values: number[],
): SuggestionGroup[] {
  const options: SuggestionOption[] = valueOptions.map((option) => ({
    value: String(option.value),
    label: option.label,
    isChecked: values.includes(option.value),
  }));
  return [
    {
      options: [
        {
          value: SELECT_ALL_VALUE,
          label: t`Select all`,
          isChecked: values.length === valueOptions.length,
          isIndeterminate:
            values.length > 0 && values.length < valueOptions.length,
          isSelectAll: true,
        },
      ],
    },
    { hasDivider: true, options },
  ];
}
