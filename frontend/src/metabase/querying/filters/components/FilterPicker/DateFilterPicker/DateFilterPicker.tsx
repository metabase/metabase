import { useMemo } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { DatePicker } from "metabase/querying/common/components/DatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { useDateFilter } from "metabase/querying/filters/hooks/use-date-filter";
import { PopoverBackButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterSubmitButton } from "../FilterSubmitButton";
import type { FilterPickerWidgetProps } from "../types";

export function DateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
  withSubmitButton,
  onChange,
  onBack,
  readOnly,
}: FilterPickerWidgetProps) {
  const tc = useTranslateContent();

  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const { value, availableUnits, getFilterClause } = useDateFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleChange = (value: DatePickerValue) => {
    onChange(getFilterClause(value), { run: true });
  };

  const handleAddButtonClick = (value: DatePickerValue) => {
    onChange(getFilterClause(value), { run: false });
  };

  return (
    <div data-testid="date-filter-picker">
      <DatePicker
        value={value}
        availableUnits={availableUnits}
        renderSubmitButton={({ value, isDisabled }) => {
          if (!withSubmitButton) {
            return null;
          }

          return (
            <FilterSubmitButton
              isNew={isNew}
              isDisabled={isDisabled}
              withAddButton={withAddButton}
              onAddButtonClick={() => handleAddButtonClick(value)}
            />
          );
        }}
        renderBackButton={() =>
          onBack ? (
            <PopoverBackButton
              p="sm"
              onClick={onBack}
              disabled={readOnly}
              withArrow={!readOnly}
            >
              {PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName(
                columnInfo.longDisplayName,
                tc,
              )}
            </PopoverBackButton>
          ) : null
        }
        onChange={handleChange}
        readOnly={readOnly}
      />
    </div>
  );
}
