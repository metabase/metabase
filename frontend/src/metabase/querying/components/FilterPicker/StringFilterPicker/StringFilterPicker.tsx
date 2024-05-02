import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import type { OperatorCategory } from "metabase/querying/hooks/use-string-filter";
import { useStringFilter } from "metabase/querying/hooks/use-string-filter";
import { Box, Checkbox, Flex, MultiAutocomplete } from "metabase/ui";
import * as Lib from "metabase-lib";

import { StringFilterValuePicker } from "../../FilterValuePicker";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

export function StringFilterPicker({
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
    operatorCategory,
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
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.StringFilterOperatorName) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const filter = getFilterClause(operator, values, options);
    if (filter) {
      onChange(filter);
    }
  };

  return (
    <Box
      component="form"
      miw={MIN_WIDTH}
      maw={MAX_WIDTH}
      data-testid="string-filter-picker"
      onSubmit={handleSubmit}
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
        <StringValueInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          operatorCategory={operatorCategory}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} canSubmit={isValid}>
          {operatorCategory === "partial" && (
            <CaseSensitiveOption
              value={options["case-sensitive"] ?? false}
              onChange={newValue => setOptions({ "case-sensitive": newValue })}
            />
          )}
        </FilterPickerFooter>
      </div>
    </Box>
  );
}

interface StringValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: string[];
  operatorCategory: OperatorCategory;
  onChange: (values: string[]) => void;
}

function StringValueInput({
  query,
  stageIndex,
  column,
  values,
  operatorCategory,
  onChange,
}: StringValueInputProps) {
  if (operatorCategory === "exact") {
    return (
      <Box p="md" mah="25vh" style={{ overflow: "auto" }}>
        <StringFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          autoFocus
          onChange={onChange}
        />
      </Box>
    );
  }

  if (operatorCategory === "partial") {
    return (
      <Flex p="md">
        <MultiAutocomplete
          value={values}
          data={[]}
          placeholder={t`Enter some text`}
          autoFocus
          w="100%"
          aria-label={t`Filter value`}
          onChange={onChange}
        />
      </Flex>
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
        onChange={e => onChange(e.target.checked)}
      />
    </Flex>
  );
}
