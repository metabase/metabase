import { useMemo, useState } from "react";
import { t } from "ttag";
import { Box, Button, Checkbox, Divider, Group, Stack } from "metabase/ui";
import { BackButton } from "../BackButton";
import { MIN_WIDTH } from "../constants";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  ExcludeDatePickerOperator,
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
  availableOperators: ReadonlyArray<DatePickerOperator>;
  availableUnits: ReadonlyArray<DatePickerExtractionUnit>;
  isNew: boolean;
  onChange: (value: ExcludeDatePickerValue) => void;
  onBack: () => void;
}

export function ExcludeDatePicker({
  value,
  availableOperators,
  availableUnits,
  isNew,
  onChange,
  onBack,
}: ExcludeDatePickerProps) {
  const [unit, setUnit] = useState(value?.unit);
  const [values, setValues] = useState(value?.values ?? []);

  const handleSelectUnit = (unit: DatePickerExtractionUnit) => {
    setUnit(unit);
    setValues([]);
  };

  const handleBack = () => {
    setUnit(undefined);
  };

  return unit ? (
    <ExcludeValuePicker
      isNew={isNew}
      unit={unit}
      initialValues={values}
      onChange={onChange}
      onBack={handleBack}
    />
  ) : (
    <ExcludeOptionPicker
      value={value}
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      onChange={onChange}
      onSelectUnit={handleSelectUnit}
      onBack={onBack}
    />
  );
}

interface ExcludeOptionPickerProps {
  value: ExcludeDatePickerValue | undefined;
  availableOperators: ReadonlyArray<DatePickerOperator>;
  availableUnits: ReadonlyArray<DatePickerExtractionUnit>;
  onChange: (value: ExcludeDatePickerValue) => void;
  onSelectUnit: (unit: DatePickerExtractionUnit) => void;
  onBack: () => void;
}

export function ExcludeOptionPicker({
  value,
  availableOperators,
  availableUnits,
  onChange,
  onSelectUnit,
  onBack,
}: ExcludeOptionPickerProps) {
  const unitOptions = useMemo(() => {
    return getExcludeUnitOptions(availableOperators, availableUnits);
  }, [availableOperators, availableUnits]);

  const operatorOptions = useMemo(() => {
    return getExcludeOperatorOptions(availableOperators);
  }, [availableOperators]);

  const handleChange = (operator: ExcludeDatePickerOperator) => {
    onChange(getExcludeOperatorValue(operator));
  };

  return (
    <Box miw={MIN_WIDTH}>
      <BackButton onClick={onBack}>{t`Exclude…`}</BackButton>
      <Divider />
      <Box p="sm">
        {unitOptions.map((option, index) => (
          <Button
            key={index}
            c="text.2"
            display="block"
            variant="subtle"
            onClick={() => onSelectUnit(option.unit)}
          >
            {option.label}
          </Button>
        ))}
        {unitOptions.length > 0 && operatorOptions.length > 0 && (
          <Divider mx="md" my="sm" />
        )}
        {operatorOptions.map((option, index) => (
          <Button
            key={index}
            c={option.operator === value?.operator ? "brand.1" : "text.2"}
            display="block"
            variant="subtle"
            onClick={() => handleChange(option.operator)}
          >
            {option.label}
          </Button>
        ))}
      </Box>
    </Box>
  );
}

interface ExcludeValuePickerProps {
  isNew: boolean;
  unit: DatePickerExtractionUnit;
  initialValues: number[];
  onChange: (value: ExcludeDatePickerValue) => void;
  onBack: () => void;
}

function ExcludeValuePicker({
  isNew,
  unit,
  initialValues,
  onChange,
  onBack,
}: ExcludeValuePickerProps) {
  const [values, setValues] = useState(initialValues);
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
    onChange(getExcludeUnitValue(unit, values));
  };

  return (
    <Box miw={MIN_WIDTH}>
      <BackButton onClick={onBack}>{option?.label}</BackButton>
      <Divider />
      <Stack p="md">
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
      </Stack>
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" disabled={isEmpty} onClick={handleSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </Box>
  );
}
