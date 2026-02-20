import { useMemo } from "react";
import { t } from "ttag";

import {
  getDateFilterClause,
  getDatePickerUnits,
  getDatePickerValue,
} from "metabase/metrics/utils/dates";
import { DatePicker } from "metabase/querying/common/components/DatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { Button, Flex, PopoverBackButton } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { FilterSubmitButton } from "../FilterSubmitButton";
import type { FilterPickerWidgetProps } from "../types";

export function DateFilterPicker({
  definition,
  dimension,
  filter,
  isNew,
  readOnly,
  onSelect,
  onBack,
  onClear,
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
    onSelect(getDateFilterClause(dimension, value));
  };

  return (
    <div data-testid="date-filter-picker">
      <DatePicker
        value={value}
        availableUnits={availableUnits}
        readOnly={readOnly}
        renderSubmitButton={() => {
          return (
            <Flex justify="space-between" w="100%">
              {onClear ? (
                <Button variant="subtle" c="text-secondary" onClick={onClear}>
                  {t`Clear`}
                </Button>
              ) : (
                <div />
              )}
              <FilterSubmitButton isNew={isNew} />
            </Flex>
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
              {dimensionInfo.displayName}
            </PopoverBackButton>
          ) : null
        }
        onChange={handleChange}
      />
    </div>
  );
}
