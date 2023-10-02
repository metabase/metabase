import { useMemo, useState } from "react";
import { t } from "ttag";
import { Button, Checkbox, Group, Divider, Stack } from "metabase/ui";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  ExcludeDatePickerValue,
} from "../types";
import {
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
}

export function ExcludeDatePicker({
  value,
  availableOperators,
  availableUnits,
  onChange,
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

  return unit ? (
    <ExcludeValuePicker
      unit={unit}
      initialValues={values}
      onChangeValues={handleChangeValues}
    />
  ) : (
    <ExcludeOptionPicker
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      onChangeUnit={handleChangeUnit}
      onChangeOperator={handleChangeOperator}
    />
  );
}

interface ExcludeOptionPickerProps {
  availableOperators: DatePickerOperator[];
  availableUnits: DatePickerExtractionUnit[];
  onChangeOperator: (operator: DatePickerOperator) => void;
  onChangeUnit: (unit: DatePickerExtractionUnit) => void;
}

export function ExcludeOptionPicker({
  availableOperators,
  availableUnits,
  onChangeOperator,
  onChangeUnit,
}: ExcludeOptionPickerProps) {
  const unitOptions = useMemo(() => {
    return getExcludeUnitOptions(availableOperators, availableUnits);
  }, [availableOperators, availableUnits]);

  const operatorOptions = useMemo(() => {
    return getExcludeOperatorOptions(availableOperators);
  }, [availableOperators]);

  return (
    <div>
      {unitOptions.length > 0 && (
        <Stack>
          {unitOptions.map((option, index) => (
            <Button key={index} onClick={() => onChangeUnit(option.unit)}>
              {option.label}
            </Button>
          ))}
        </Stack>
      )}
      {unitOptions.length > 0 && operatorOptions.length > 0 && <Divider />}
      {operatorOptions.length > 0 && (
        <Stack>
          {operatorOptions.map((option, index) => (
            <Button
              key={index}
              onClick={() => onChangeOperator(option.operator)}
            >
              {option.label}
            </Button>
          ))}
        </Stack>
      )}
    </div>
  );
}

interface ExcludeValuePickerProps {
  unit: DatePickerExtractionUnit;
  initialValues: number[];
  onChangeValues: (values: number[]) => void;
}

function ExcludeValuePicker({
  unit,
  initialValues,
  onChangeValues,
}: ExcludeValuePickerProps) {
  const [values] = useState(initialValues);
  const isEmpty = values.length === 0;

  const optionGroups = useMemo(() => {
    return getExcludeValueOptionGroups(unit);
  }, [unit]);

  const handleSubmit = () => {
    onChangeValues(values);
  };

  return (
    <Stack>
      <Checkbox
        checked={isEmpty}
        label={isEmpty ? t`Select none…` : t`Select all…`}
      />
      <Divider />
      <Group>
        {optionGroups.map((group, groupIndex) => (
          <Stack key={groupIndex}>
            {group.map((option, optionIndex) => (
              <Checkbox
                key={optionIndex}
                label={option.label}
                checked={!values.includes(option.value)}
              />
            ))}
          </Stack>
        ))}
      </Group>
      <Divider />
      <Button variant="filled" disabled={isEmpty} onClick={handleSubmit}>
        {t`Add filter`}
      </Button>
    </Stack>
  );
}
