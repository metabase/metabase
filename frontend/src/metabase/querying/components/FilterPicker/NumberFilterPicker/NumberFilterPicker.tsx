import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";
import { Box, Flex, NumberInput, Text } from "metabase/ui";
import { useNumberFilter } from "metabase/querying/hooks/use-number-filter";
import type { NumberValue } from "metabase/querying/hooks/use-number-filter";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "../types";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";
import { FilterValuesWidget } from "../FilterValuesWidget";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";

export function NumberFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const {
    operator,
    availableOperators,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getFilterClause,
    handleOperatorChange,
    handleValuesChange,
  } = useNumberFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const filter = getFilterClause();
    if (filter) {
      onChange(filter);
    }
  };

  return (
    <Box
      component="form"
      miw={MIN_WIDTH}
      maw={MAX_WIDTH}
      data-testid="number-filter-picker"
      onSubmit={handleSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader>
      <div>
        <NumberValueInput
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={handleValuesChange}
        />
        <FilterPickerFooter isNew={isNew} canSubmit={isValid} />
      </div>
    </Box>
  );
}

interface NumberValueInputProps {
  column: Lib.ColumnMetadata;
  values: NumberValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberValue[]) => void;
}

function NumberValueInput({
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: NumberValueInputProps) {
  const placeholder = t`Enter a number`;

  if (hasMultipleValues) {
    return (
      <FlexWithScroll p="md" mah={300}>
        <FilterValuesWidget
          value={values}
          column={column}
          hasMultipleValues
          onChange={onChange}
        />
      </FlexWithScroll>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberInput
          value={values[0]}
          onChange={newValue => onChange([newValue])}
          placeholder={placeholder}
          autoFocus
          w="100%"
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center" justify="center" p="md">
        <NumberInput
          value={values[0]}
          onChange={(newValue: number) => onChange([newValue, values[1]])}
          placeholder={placeholder}
          autoFocus
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberInput
          value={values[1]}
          onChange={(newValue: number) => onChange([values[0], newValue])}
          placeholder={placeholder}
        />
      </Flex>
    );
  }

  return null;
}
