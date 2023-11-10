import { useState, useMemo } from "react";
import { t } from "ttag";
import { Box, Checkbox, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import { MAX_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";
import { getAvailableOperatorOptions } from "../utils";
import { ColumnValuesWidget } from "../ColumnValuesWidget";
import { FilterHeader } from "../FilterHeader";
import { FilterFooter } from "../FilterFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, hasValidValues } from "./utils";

const MAX_HEIGHT = 300;

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

  const filterParts = useMemo(
    () => (filter ? Lib.stringFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : "=",
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values),
  );

  const [options, setOptions] = useState(
    filterParts ? filterParts.options : {},
  );

  const { valueCount, hasMultipleValues, hasCaseSensitiveOption } =
    OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(operator, values);

  const handleOperatorChange = (operator: Lib.StringFilterOperatorName) => {
    setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  const handleSubmit = () => {
    if (isValid) {
      onChange(
        Lib.stringFilterClause({
          operator,
          column,
          values,
          options,
        }),
      );
    }
  };

  return (
    <Box maw={MAX_WIDTH} data-testid="string-filter-picker">
      <FilterHeader columnName={columnInfo.longDisplayName} onBack={onBack}>
        <FilterOperatorPicker
          value={operator}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </FilterHeader>
      <Box>
        {valueCount !== 0 && (
          <FlexWithScroll p="md" mah={MAX_HEIGHT}>
            <ColumnValuesWidget
              column={column}
              value={values}
              hasMultipleValues={hasMultipleValues}
              onChange={setValues}
            />
          </FlexWithScroll>
        )}
        <FilterFooter isNew={isNew} canSubmit={isValid} onSubmit={handleSubmit}>
          {hasCaseSensitiveOption && (
            <CaseSensitiveOption
              value={options["case-sensitive"] ?? false}
              onChange={newValue => setOptions({ "case-sensitive": newValue })}
            />
          )}
        </FilterFooter>
      </Box>
    </Box>
  );
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
