import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import type { BooleanFilterValue } from "metabase/querying/common/types";
import { Box, SegmentedControl } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";
import { useReportDraftFilter } from "../use-report-draft-filter";

import S from "./BooleanFilterPicker.module.css";
import { useBooleanFilter } from "./hooks";

type BooleanValue = "true" | "false";

const OPERATORS: Lib.BooleanFilterOperator[] = ["=", "is-null", "not-null"];

export function BooleanFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  readOnly,
  withAddButton,
  withSubmitButton,
  onBack,
  onChange,
  onDraftChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const operatorOptions = useMemo(
    () =>
      OPERATORS.map((operator) => ({
        operator,
        displayName: Lib.describeFilterOperator(operator),
      })),
    [],
  );

  const { value, getFilterClause, setValue } = useBooleanFilter({
    query,
    stageIndex,
    column,
    filter,
  });
  const operator = getOperator(value);
  // The last true or false value, so that the switch to "is empty" and back
  // keeps it.
  const [booleanValue, setBooleanValue] = useState<BooleanValue>(
    isBooleanValue(value) ? value : "true",
  );

  const handleOperatorChange = (newOperator: Lib.BooleanFilterOperator) => {
    setValue(newOperator === "=" ? booleanValue : newOperator);
  };

  const handleBooleanChange = (newValue: BooleanValue) => {
    setBooleanValue(newValue);
    setValue(newValue);
  };

  useReportDraftFilter(onDraftChange, { value }, () => getFilterClause());

  const handleFilterChange = (opts: FilterChangeOpts) => {
    onChange(getFilterClause(), opts);
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
      data-testid="boolean-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
        readOnly={readOnly}
      >
        <FilterOperatorPicker
          value={operator}
          options={operatorOptions}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader>
      {operator === "=" && (
        <Box px="xl" pt="md">
          <SegmentedControl<BooleanValue>
            data={[
              { value: "true", label: t`True` },
              { value: "false", label: t`False` },
            ]}
            value={booleanValue}
            fullWidth
            classNames={{ label: S.label }}
            onChange={handleBooleanChange}
          />
        </Box>
      )}
      <FilterPickerFooter
        isNew={isNew}
        isValid
        withAddButton={withAddButton}
        withSubmitButton={withSubmitButton}
        onAddButtonClick={handleAddButtonClick}
      />
    </Box>
  );
}

function isBooleanValue(value: string): value is BooleanValue {
  return value === "true" || value === "false";
}

function getOperator(value: BooleanFilterValue): Lib.BooleanFilterOperator {
  return isBooleanValue(value) ? "=" : value;
}
