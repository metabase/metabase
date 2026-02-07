import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { BigIntNumberInput } from "metabase/querying/common/components/BigIntNumberInput";
import { Box, Flex, Stack, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { NumberFilterValuePicker } from "../FilterValuePicker";
import { COMBOBOX_PROPS, WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

import { CoordinateDimensionPicker } from "./CoordinateDimensionPicker";
import { useCoordinateFilter } from "./hooks";
import type { NumberOrEmptyValue } from "./types";

export function CoordinateFilterPicker({
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
    secondDimension,
    availableDimensions,
    canPickDimensions,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setSecondDimension,
    setValues,
  } = useCoordinateFilter({
    definition,
    dimension,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.CoordinateFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    const filter = getFilterClause(operator, secondDimension, values);
    if (filter) {
      onSelect(filter);
    }
  };

  return (
    <Box
      component="form"
      w={WIDTH}
      data-testid="coordinate-filter-picker"
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
      <Box>
        {canPickDimensions && (
          <CoordinateDimensionPicker
            definition={definition}
            dimension={dimension}
            secondDimension={secondDimension}
            availableDimensions={availableDimensions}
            onSelect={setSecondDimension}
          />
        )}
        <CoordinateValueInput
          definition={definition}
          dimension={dimension}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} isValid={isValid} />
      </Box>
    </Box>
  );
}

interface CoordinateValueInputProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberOrEmptyValue[]) => void;
}

function CoordinateValueInput({
  definition,
  dimension,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: CoordinateValueInputProps) {
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

  if (valueCount === 4) {
    return (
      <Stack align="center" justify="center" gap="sm" p="md">
        <BigIntNumberInput
          label={t`Upper latitude`}
          value={values[0]}
          placeholder="90"
          autoFocus
          onChange={(newValue) =>
            onChange([newValue, values[1], values[2], values[3]])
          }
        />
        <Flex align="center" justify="center" gap="sm">
          <BigIntNumberInput
            label={t`Left longitude`}
            value={values[1]}
            placeholder="-180"
            onChange={(newValue) =>
              onChange([values[0], newValue, values[2], values[3]])
            }
          />
          <BigIntNumberInput
            label={t`Right longitude`}
            value={values[3]}
            placeholder="180"
            onChange={(newValue) =>
              onChange([values[0], values[1], values[2], newValue])
            }
          />
        </Flex>
        <BigIntNumberInput
          label={t`Lower latitude`}
          value={values[2]}
          placeholder="-90"
          onChange={(newValue) =>
            onChange([values[0], values[1], newValue, values[3]])
          }
        />
      </Stack>
    );
  }

  return null;
}
