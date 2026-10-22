import { useMemo } from "react";

import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/content-translation/plugins";
import { DatePicker } from "metabase/querying/common/components/DatePicker";
import { SimpleDatePicker } from "metabase/querying/common/components/DatePicker/SimpleDatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { PopoverBackButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterSubmitButton } from "../FilterSubmitButton";
import type { FilterPickerWidgetProps } from "../types";
import { useReportDraftFilter } from "../use-report-draft-filter";

import { useDateFilter } from "./hooks";

export function DateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
  withSubmitButton,
  onChange,
  onDraftChange,
  onBack,
  readOnly,
}: FilterPickerWidgetProps) {
  const tc = useTranslateContent();
  const { locale } = useLocale();

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
        renderSubmitButton={({ value, isDisabled }) => (
          <>
            <DateDraftReporter
              value={isDisabled ? undefined : value}
              getFilterClause={getFilterClause}
              onDraftChange={onDraftChange}
            />
            {withSubmitButton && (
              <FilterSubmitButton
                isNew={isNew}
                isDisabled={isDisabled}
                withAddButton={withAddButton}
                onAddButtonClick={() => handleAddButtonClick(value)}
              />
            )}
          </>
        )}
        renderBackButton={() =>
          onBack ? (
            <PopoverBackButton
              px="sm"
              py="md"
              h="auto"
              onClick={onBack}
              disabled={readOnly}
              withArrow={!readOnly}
            >
              {PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
                displayName: columnInfo.longDisplayName,
                tc,
                locale,
              })}
            </PopoverBackButton>
          ) : null
        }
        onChange={handleChange}
        readOnly={readOnly}
      />
    </div>
  );
}

interface DateDraftReporterProps {
  value: DatePickerValue | undefined;
  getFilterClause: (value: DatePickerValue) => Lib.ExpressionClause;
  onDraftChange: FilterPickerWidgetProps["onDraftChange"];
}

// DatePicker keeps its draft value inside, and only passes it to the submit
// button. This component reports that value as a draft filter.
function DateDraftReporter({
  value,
  getFilterClause,
  onDraftChange,
}: DateDraftReporterProps) {
  useReportDraftFilter(onDraftChange, value, () =>
    value ? getFilterClause(value) : undefined,
  );
  return null;
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
  const { value, availableUnits, getFilterClause } = useDateFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleChange = (value: DatePickerValue | undefined) => {
    if (value) {
      onChange(getFilterClause(value));
    } else {
      onChange(undefined);
    }
  };

  return (
    <div data-testid="date-filter-picker">
      <SimpleDatePicker
        value={value}
        availableUnits={availableUnits}
        onChange={handleChange}
      />
    </div>
  );
}
