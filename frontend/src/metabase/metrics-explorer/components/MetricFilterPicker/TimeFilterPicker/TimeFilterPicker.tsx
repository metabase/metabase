import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { Box, Flex, Text, TimeInput } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";

import { useTimeFilter } from "./hooks";
import type { TimeValue } from "./types";

export function TimeFilterPicker({
  definition,
  dimension,
  source,
  filter,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const dimensionInfo = useMemo(
    () => LibMetric.displayInfo(definition, dimension),
    [definition, dimension],
  );

  const {
    operator,
    values,
    valueCount,
    availableOptions,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useTimeFilter({
    definition,
    dimension,
    source,
    filter,
  });

  const handleOperatorChange = (newOperator: LibMetric.TimeFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleFilterChange = (opts: FilterChangeOpts) => {
    const filter = getFilterClause(operator, values);
    if (filter) {
      onChange(source, filter, opts);
    }
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    handleFilterChange({ run: true });
  };

  const handleAddButtonClick = () => {
    handleFilterChange({ run: false });
  };

  return (
    <Box
      component="form"
      w={WIDTH}
      data-testid="time-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        dimensionName={dimensionInfo.displayName}
        onBack={onBack}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOptions}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader>
      <Box>
        {valueCount > 0 && (
          <Flex p="md">
            <TimeValueInput
              values={values}
              valueCount={valueCount}
              onChange={setValues}
            />
          </Flex>
        )}
        <FilterPickerFooter isValid onAddButtonClick={handleAddButtonClick} />
      </Box>
    </Box>
  );
}

interface TimeValueInputProps {
  values: TimeValue[];
  valueCount: number;
  onChange: (values: TimeValue[]) => void;
}

function TimeValueInput({ values, valueCount, onChange }: TimeValueInputProps) {
  if (valueCount === 1) {
    const [value] = values;
    return (
      <TimeInput
        value={value}
        w="100%"
        autoFocus
        onChange={(newValue) => onChange([newValue])}
      />
    );
  }

  if (valueCount === 2) {
    const [value1, value2] = values;
    return (
      <Flex direction="row" align="center" gap="sm" w="100%">
        <TimeInput
          value={value1}
          w="100%"
          autoFocus
          onChange={(newValue1) => onChange([newValue1, value2])}
        />
        <Text>{t`and`}</Text>
        <TimeInput
          value={value2}
          w="100%"
          onChange={(newValue2) => onChange([value1, newValue2])}
        />
      </Flex>
    );
  }

  return null;
}
