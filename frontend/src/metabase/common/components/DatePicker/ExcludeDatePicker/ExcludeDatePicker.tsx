import { useMemo, useState } from "react";
import { t } from "ttag";
import { Checkbox, Group, Divider, Stack, Text } from "metabase/ui";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  ExcludeDatePickerValue,
} from "../types";
import {
  getExcludeOperatorOptions,
  getExcludeUnitOptions,
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
}: ExcludeDatePickerProps) {
  const [unit, setUnit] = useState(value?.unit);
  const [values] = useState(value?.values ?? []);

  return unit ? (
    <ExcludeValuePicker unit={unit} initialValues={values} />
  ) : (
    <ExcludeOptionPicker
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      onUnitChange={setUnit}
    />
  );
}

interface ExcludeOptionPickerProps {
  availableOperators: DatePickerOperator[];
  availableUnits: DatePickerExtractionUnit[];
  onUnitChange: (unit: DatePickerExtractionUnit) => void;
}

export function ExcludeOptionPicker({
  availableOperators,
  availableUnits,
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
            <Text key={index}>{option.label}</Text>
          ))}
        </Stack>
      )}
      {unitOptions.length > 0 && operatorOptions.length > 0 && <Divider />}
      {operatorOptions.length > 0 && (
        <Stack>
          {operatorOptions.map((option, index) => (
            <Text key={index}>{option.label}</Text>
          ))}
        </Stack>
      )}
    </div>
  );
}

interface ExcludeValuePickerProps {
  unit: DatePickerExtractionUnit;
  initialValues: number[];
}

function ExcludeValuePicker({ unit, initialValues }: ExcludeValuePickerProps) {
  const [values] = useState(initialValues);
  const isEmpty = values.length === 0;

  const optionGroups = useMemo(() => {
    return getExcludeValueOptionGroups(unit);
  }, [unit]);

  return (
    <Stack>
      <Checkbox checked={isEmpty}>
        {isEmpty ? t`Select none…` : t`Select all…`}
      </Checkbox>
      <Divider />
      <Group>
        {optionGroups.map((group, groupIndex) => (
          <Stack key={groupIndex}>
            {group.map((option, optionIndex) => (
              <Checkbox
                key={optionIndex}
                checked={!values.includes(option.value)}
              >
                {option.label}
              </Checkbox>
            ))}
          </Stack>
        ))}
      </Group>
    </Stack>
  );
}
