import { useMemo } from "react";

import {
  getDateFilterClause,
  getDatePickerUnits,
  getDatePickerValue,
} from "metabase/metrics/utils/dates";
import { DatePicker } from "metabase/querying/common/components/DatePicker";
import { SimpleDatePicker } from "metabase/querying/common/components/DatePicker/SimpleDatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { PopoverBackButton } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { FilterSubmitButton } from "../FilterSubmitButton";
import type { FilterPickerWidgetProps } from "../types";

export function DateFilterPicker({
  definition,
  dimension,
  filter,
  isNew,
  readOnly,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const value = useMemo(() => {
    return filter ? getDatePickerValue(definition, filter) : undefined;
  }, [definition, filter]);

  const dimensionInfo = useMemo(() => {
    return LibMetric.displayInfo(definition, dimension);
  }, [definition, dimension]);

  const availableUnits = useMemo(() => {
    return getDatePickerUnits(definition, dimension);
  }, [definition, dimension]);

  const handleChange = (value: DatePickerValue) => {
    onChange(getDateFilterClause(dimension, value));
  };

  return (
    <div data-testid="date-filter-picker">
      <DatePicker
        value={value}
        availableUnits={availableUnits}
        readOnly={readOnly}
        renderSubmitButton={() => {
          return <FilterSubmitButton isNew={isNew} />;
        }}
        renderBackButton={() =>
          onBack ? (
            <PopoverBackButton
              p="sm"
              onClick={onBack}
              disabled={readOnly}
              withArrow={!readOnly}
            >
              {dimensionInfo.displayName}
            </PopoverBackButton>
          ) : null
        }
        onChange={handleChange}
      />
    </div>
  );
}

interface SimpleDateFilterPickerProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
  onChange: (filter: LibMetric.FilterClause | undefined) => void;
}

export function SimpleDateFilterPicker({
  definition,
  dimension,
  filter,
  onChange,
}: SimpleDateFilterPickerProps) {
  const value = useMemo(() => {
    return filter ? getDatePickerValue(definition, filter) : undefined;
  }, [definition, filter]);

  const availableUnits = useMemo(() => {
    return getDatePickerUnits(definition, dimension);
  }, [definition, dimension]);

  const handleChange = (value: DatePickerValue | undefined) => {
    if (value) {
      onChange(getDateFilterClause(dimension, value));
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
