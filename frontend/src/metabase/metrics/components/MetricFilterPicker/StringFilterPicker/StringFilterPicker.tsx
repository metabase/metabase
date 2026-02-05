import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { Box, Checkbox, Flex, MultiAutocomplete } from "metabase/ui";
import type * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { StringFilterValuePicker } from "../FilterValuePicker";
import { COMBOBOX_PROPS, WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

import { type OperatorType, useStringFilter } from "./hooks";

export function StringFilterPicker({
  definition,
  dimension,
  filter,
  isNew,
  readOnly,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const dimensionInfo = useMemo(
    () => LibMetric.displayInfo(definition, dimension),
    [definition, dimension],
  );

  const {
    type,
    operator,
    availableOptions,
    values,
    options,
    isValid,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
    setOptions,
  } = useStringFilter({
    definition,
    dimension,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.StringFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    const filter = getFilterClause(operator, values, options);
    if (filter) {
      onChange(filter);
    }
  };

  return (
    <Box
      component="form"
      w={WIDTH}
      data-testid="string-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        dimensionName={dimensionInfo.displayName}
        onBack={onBack}
        readOnly={readOnly}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOptions}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader>
      <div>
        <StringValueInput
          definition={definition}
          dimension={dimension}
          values={values}
          type={type}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} isValid={isValid}>
          {type === "partial" && (
            <CaseSensitiveOption
              value={options.caseSensitive ?? false}
              onChange={(newValue) => setOptions({ caseSensitive: newValue })}
            />
          )}
        </FilterPickerFooter>
      </div>
    </Box>
  );
}

interface StringValueInputProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  values: string[];
  type: OperatorType;
  onChange: (values: string[]) => void;
}

function StringValueInput({
  definition,
  dimension,
  values,
  type,
  onChange,
}: StringValueInputProps) {
  if (type === "exact") {
    return (
      <Box p="md" pb={0} mah="25vh" style={{ overflow: "auto" }}>
        <StringFilterValuePicker
          definition={definition}
          dimension={dimension}
          values={values}
          comboboxProps={COMBOBOX_PROPS}
          autoFocus
          onChange={onChange}
        />
        <Box pt="md" />
      </Box>
    );
  }

  if (type === "partial") {
    return (
      <Box p="md" pb={0} mah="40vh" style={{ overflow: "auto" }}>
        <MultiAutocomplete
          value={values}
          placeholder={t`Enter some text`}
          comboboxProps={COMBOBOX_PROPS}
          aria-label={t`Filter value`}
          onChange={onChange}
        />
        <Box pt="md" />
      </Box>
    );
  }

  return null;
}

interface CaseSensitiveOptionProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

function CaseSensitiveOption({ value, onChange }: CaseSensitiveOptionProps) {
  return (
    <Flex align="center" px="sm">
      <Checkbox
        size="xs"
        label={t`Case sensitive`}
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Flex>
  );
}
