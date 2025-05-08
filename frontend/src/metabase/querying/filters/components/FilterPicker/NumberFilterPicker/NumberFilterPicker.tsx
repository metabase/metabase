import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import {
  type NumberOrEmptyValue,
  useNumberFilter,
} from "metabase/querying/filters/hooks/use-number-filter";
import { Box, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NumberFilterValuePicker } from "../../FilterValuePicker";
import { NumberFilterInput } from "../../NumberFilterInput";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { COMBOBOX_PROPS, WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";

export function NumberFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
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
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useNumberFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.NumberFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleFilterChange = (opts: FilterChangeOpts) => {
    const filter = getFilterClause(operator, values);
    if (filter) {
      onChange(filter, opts);
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
      data-testid="number-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOptions}
          onChange={handleOperatorChange}
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
        <FilterPickerFooter
          isNew={isNew}
          isValid={isValid}
          withAddButton={withAddButton}
          onAddButtonClick={handleAddButtonClick}
        />
      </div>
    </Box>
  );
}

interface NumberValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberOrEmptyValue[]) => void;
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
  if (hasMultipleValues) {
    return (
      <Box p="md" mah="25vh" style={{ overflow: "auto" }}>
        <NumberFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
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
        <NumberFilterInput
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
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Min`}
          autoFocus
          onChange={(newValue) => onChange([newValue, values[1]])}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberFilterInput
          value={values[1]}
          placeholder={t`Max`}
          onChange={(newValue) => onChange([values[0], newValue])}
        />
      </Flex>
    );
  }

  return null;
}
