import { useMemo, useState } from "react";
import { t } from "ttag";
import { Button, Checkbox, Divider, Group, Stack } from "metabase/ui";
import { BackButton } from "../BackButton";
import { OptionButton } from "../OptionButton";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  ExcludeDatePickerValue,
} from "../types";
import type { ExcludeValueOption } from "./types";
import {
  findExcludeUnitOption,
  getExcludeOperatorOptions,
  getExcludeOperatorValue,
  getExcludeUnitOptions,
  getExcludeUnitValue,
  getExcludeValueOptionGroups,
} from "./utils";

export interface ExcludeDatePickerProps {
  value?: ExcludeDatePickerValue;
  availableOperators: DatePickerOperator[];
  availableUnits: DatePickerExtractionUnit[];
  onChange: (value: ExcludeDatePickerValue) => void;
  onBack: () => void;
}

export function ExcludeDatePicker({
  value,
  availableOperators,
  availableUnits,
  onChange,
  onBack,
}: ExcludeDatePickerProps) {
  const [unit, setUnit] = useState(value?.unit);
  const [values, setValues] = useState(value?.values ?? []);

  const handleChangeValues = (values: number[]) => {
    if (unit) {
      onChange(getExcludeUnitValue(unit, values));
    }
  };

  const handleChangeOperator = (operator: DatePickerOperator) => {
    onChange(getExcludeOperatorValue(operator));
  };

  const handleChangeUnit = (unit: DatePickerExtractionUnit) => {
    setUnit(unit);
    setValues([]);
  };

  const handleBack = () => {
    setUnit(undefined);
  };

  return unit ? (
    <ExcludeValuePicker
      value={value}
      unit={unit}
      initialValues={values}
      onChangeValues={handleChangeValues}
      onBack={handleBack}
    />
  ) : (
    <ExcludeOptionPicker
      value={value}
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      onChangeUnit={handleChangeUnit}
      onChangeOperator={handleChangeOperator}
      onBack={onBack}
    />
  );
}

interface ExcludeOptionPickerProps {
  value: ExcludeDatePickerValue | undefined;
  availableOperators: DatePickerOperator[];
  availableUnits: DatePickerExtractionUnit[];
  onChangeOperator: (operator: DatePickerOperator) => void;
  onChangeUnit: (unit: DatePickerExtractionUnit) => void;
  onBack: () => void;
}

export function ExcludeOptionPicker({
  value,
  availableOperators,
  availableUnits,
  onChangeOperator,
  onChangeUnit,
  onBack,
}: ExcludeOptionPickerProps) {
  const unitOptions = useMemo(() => {
    return getExcludeUnitOptions(availableOperators, availableUnits);
  }, [availableOperators, availableUnits]);

  const operatorOptions = useMemo(() => {
    return getExcludeOperatorOptions(availableOperators);
  }, [availableOperators]);

  return (
    <Stack spacing={0}>
      <BackButton onClick={onBack}>{t`Exclude…`}</BackButton>
      <Divider my="xs" />
      {unitOptions.map((option, index) => (
        <OptionButton key={index} onClick={() => onChangeUnit(option.unit)}>
          {option.label}
        </OptionButton>
      ))}
      {unitOptions.length > 0 && operatorOptions.length > 0 && (
        <Divider my="xs" />
      )}
      {operatorOptions.map((option, index) => (
        <OptionButton
          key={index}
          isSelected={value?.operator === option.operator}
          onClick={() => onChangeOperator(option.operator)}
        >
          {option.label}
        </OptionButton>
      ))}
    </Stack>
  );
}

interface ExcludeValuePickerProps {
  value: ExcludeDatePickerValue | undefined;
  unit: DatePickerExtractionUnit;
  initialValues: number[];
  onChangeValues: (values: number[]) => void;
  onBack: () => void;
}

function ExcludeValuePicker({
  value,
  unit,
  initialValues,
  onChangeValues,
  onBack,
}: ExcludeValuePickerProps) {
  const [values, setValues] = useState(initialValues);
  const isNew = value == null;
  const isEmpty = values.length === 0;

  const option = useMemo(() => {
    return findExcludeUnitOption(unit);
  }, [unit]);

  const groups = useMemo(() => {
    return getExcludeValueOptionGroups(unit);
  }, [unit]);

  const handleToggleAll = (isChecked: boolean) => {
    if (isChecked) {
      setValues([]);
    } else {
      setValues(groups.flatMap(groups => groups.map(({ value }) => value)));
    }
  };

  const handleToggleOption = (
    option: ExcludeValueOption,
    isChecked: boolean,
  ) => {
    if (isChecked) {
      setValues(values.filter(value => value !== option.value));
    } else {
      setValues([...values, option.value]);
    }
  };

  const handleSubmit = () => {
    onChangeValues(values);
  };

  return (
    <Stack>
      <BackButton onClick={onBack}>{option?.label}</BackButton>
      <Divider />
      <Checkbox
        checked={isEmpty}
        label={isEmpty ? t`Select none…` : t`Select all…`}
        onChange={event => handleToggleAll(event.target.checked)}
      />
      <Divider />
      <Group>
        {groups.map((group, groupIndex) => (
          <Stack key={groupIndex}>
            {group.map((option, optionIndex) => (
              <Checkbox
                key={optionIndex}
                label={option.label}
                checked={!values.includes(option.value)}
                onChange={event =>
                  handleToggleOption(option, event.target.checked)
                }
              />
            ))}
          </Stack>
        ))}
      </Group>
      <Divider />
      <Button variant="filled" disabled={isEmpty} onClick={handleSubmit}>
        {isNew ? t`Add filter` : t`Update filter`}
      </Button>
    </Stack>
  );
}
