import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { BigIntNumberInput } from "metabase/querying/common/components/BigIntNumberInput";
import { Box, Flex, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { NumberFilterValuePicker } from "../FilterValuePicker";
import { COMBOBOX_PROPS, WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

import { useNumberFilter } from "./hooks";
import type { NumberOrEmptyValue } from "./types";

export function NumberFilterPicker({
  definition,
  dimension,
  filter,
  isNew,
  readOnly,
  onSelect,
  onBack,
}: FilterPickerWidgetProps) {
  const dimensionInfo = useMemo(
    () => LibMetric.displayInfo(definition, dimension),
    [definition, dimension],
  );

  const {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useNumberFilter({
    definition,
    dimension,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.NumberFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    const filter = getFilterClause(operator, values);
    if (filter) {
      onSelect(filter);
    }
  };

  return (
    <Box
      component="form"
      w={WIDTH}
      data-testid="number-filter-picker"
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
          onSelect={handleOperatorChange}
        />
      </FilterPickerHeader>
      <div>
        <NumberValueInput
          definition={definition}
          dimension={dimension}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} isValid={isValid} />
      </div>
    </Box>
  );
}

interface NumberValueInputProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberOrEmptyValue[]) => void;
}

function NumberValueInput({
  definition,
  dimension,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: NumberValueInputProps) {
  if (hasMultipleValues) {
    return (
      <Box p="md" mah="25vh" style={{ overflow: "auto" }}>
        <NumberFilterValuePicker
          definition={definition}
          dimension={dimension}
          values={values.filter(isNotNull)}
          autoFocus
          comboboxProps={COMBOBOX_PROPS}
          onChange={onChange}
        />
      </Box>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <BigIntNumberInput
          value={values[0]}
          placeholder={t`Enter a number`}
          autoFocus
          w="100%"
          aria-label={t`Filter value`}
          onChange={(newValue) => onChange([newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center" justify="center" p="md">
        <BigIntNumberInput
          value={values[0]}
          placeholder={t`Min`}
          autoFocus
          onChange={(newValue) => onChange([newValue, values[1]])}
        />
        <Text mx="sm">{t`and`}</Text>
        <BigIntNumberInput
          value={values[1]}
          placeholder={t`Max`}
          onChange={(newValue) => onChange([values[0], newValue])}
        />
      </Flex>
    );
  }

  return null;
}
