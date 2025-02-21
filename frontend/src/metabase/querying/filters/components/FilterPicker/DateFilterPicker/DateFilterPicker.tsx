import { useMemo } from "react";
import { t } from "ttag";

import { useDateFilter } from "metabase/querying/filters/hooks/use-date-filter";
import type { DatePickerValue } from "metabase/querying/filters/types";
import * as Lib from "metabase-lib";

import { DatePicker } from "../../DatePicker";
import type { FilterPickerWidgetProps } from "../types";

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

  const { value, availableOperators, availableUnits, getFilterClause } =
    useDateFilter({
      query,
      stageIndex,
      column,
      filter,
    });

  const handleChange = (value: DatePickerValue) => {
    onChange(getFilterClause(value));
  };

  return (
    <div data-testid="date-filter-picker">
      <DatePicker
        value={value}
        availableOperators={availableOperators}
        availableUnits={availableUnits}
        submitButtonLabel={isNew ? t`Add filter` : t`Update filter`}
        backButtonLabel={columnInfo.longDisplayName}
        onChange={handleChange}
        onBack={onBack}
      />
    </div>
  );
}
