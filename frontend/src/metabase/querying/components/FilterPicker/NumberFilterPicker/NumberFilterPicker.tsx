import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";
import { Box, Flex, NumberInput, Text } from "metabase/ui";
import { useNumberFilter } from "metabase/querying/hooks/use-number-filter";
import type { NumberValue } from "metabase/querying/hooks/use-number-filter";
import * as Lib from "metabase-lib";
import { FilterValuePicker } from "../../FilterValuePicker";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";

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
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getFilterClause,
    setOperator,
    setValues,
  } = useNumberFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const filter = getFilterClause(operator, values);
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
          options={availableOptions}
          onChange={setOperator}
        />
      </FilterPickerHeader>
      <div>
        <NumberValueInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} canSubmit={isValid} />
      </div>
    </Box>
  );
}

interface NumberValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberValue[]) => void;
}

function NumberValueInput({
  query,
  stageIndex,
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: NumberValueInputProps) {
  const placeholder = t`Enter a number`;

  if (hasMultipleValues) {
    return (
      <Box p="md" mah="16rem" style={{ overflow: "auto" }}>
        <FilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          value={values.map(value => String(value))}
          placeholder={placeholder}
          getCreateLabel={query => (isFinite(parseFloat(query)) ? query : null)}
          onChange={values => onChange(values.map(value => Number(value)))}
        />
      </Box>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberInput
          value={values[0]}
          placeholder={placeholder}
          autoFocus
          w="100%"
          onChange={newValue => onChange([newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center" justify="center" p="md">
        <NumberInput
          value={values[0]}
          placeholder={placeholder}
          autoFocus
          onChange={(newValue: number) => onChange([newValue, values[1]])}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberInput
          value={values[1]}
          placeholder={placeholder}
          onChange={(newValue: number) => onChange([values[0], newValue])}
        />
      </Flex>
    );
  }

  return null;
}
