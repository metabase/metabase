import { useMemo } from "react";
import {
  DatePicker,
  SimpleDatePicker,
} from "metabase/common/components/DatePicker";
import type { DatePickerValue } from "metabase/common/components/DatePicker";
import * as Lib from "metabase-lib";
import { BackButton } from "../BackButton";
import type { FilterPickerWidgetProps } from "../types";
import {
  getFilterClause,
  getPickerOperators,
  getPickerUnits,
  getPickerValue,
} from "./utils";

export function DateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const value = useMemo(() => {
    return filter && getPickerValue(query, stageIndex, filter);
  }, [query, stageIndex, filter]);

  const availableOperators = useMemo(() => {
    return getPickerOperators(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const availableUnits = useMemo(() => {
    return getPickerUnits(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const handleChange = (value: DatePickerValue) => {
    onChange(getFilterClause(query, stageIndex, column, value));
  };

  return (
    <div data-testid="datetime-filter-picker">
      <DatePicker
        value={value}
        availableOperators={availableOperators}
        availableUnits={availableUnits}
        backButton={
          <BackButton pl="sm" onClick={onBack}>
            {columnInfo.longDisplayName}
          </BackButton>
        }
        canUseRelativeOffsets
        isNew={isNew}
        onChange={handleChange}
      />
    </div>
  );
}

interface SimpleDateFilterPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
}

export function SimpleDateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: SimpleDateFilterPickerProps) {
  const value = useMemo(() => {
    return filter && getPickerValue(query, stageIndex, filter);
  }, [query, stageIndex, filter]);

  const availableOperators = useMemo(() => {
    return getPickerOperators(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const handleChange = (value: DatePickerValue | undefined) => {
    if (value) {
      onChange(getFilterClause(query, stageIndex, column, value));
    } else {
      onChange(undefined);
    }
  };

  return (
    <div data-testid="datetime-filter-picker">
      <SimpleDatePicker
        value={value}
        availableOperators={availableOperators}
        onChange={handleChange}
      />
    </div>
  );
}
