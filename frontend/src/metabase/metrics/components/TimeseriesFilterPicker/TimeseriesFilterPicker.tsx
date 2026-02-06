import { type Ref, forwardRef } from "react";
import { t } from "ttag";

import type { DimensionWithDefinition } from "metabase/metrics/types";
import {
  getCommonTemporalUnits,
  isDatePickerUnit,
} from "metabase/metrics/utils/dates";
import { SimpleDatePicker } from "metabase/querying/common/components/DatePicker/SimpleDatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { Button } from "metabase/ui";

type TimeseriesFilterPickerProps = {
  dimensions: DimensionWithDefinition[];
  selectedFilter: DatePickerValue | undefined;
  onChange: (filter: DatePickerValue | undefined) => void;
};

export function TimeseriesFilterPicker({
  dimensions,
  selectedFilter,
  onChange,
}: TimeseriesFilterPickerProps) {
  const availableUnits =
    getCommonTemporalUnits(dimensions).filter(isDatePickerUnit);

  return (
    <SimpleDatePicker
      value={selectedFilter}
      availableUnits={availableUnits}
      onChange={onChange}
    />
  );
}

type TimeseriesFilterPickerButtonProps = {
  selectedFilter: DatePickerValue | undefined;
  onClick?: () => void;
};

export const TimeseriesFilterPickerButton = forwardRef(
  function TimeseriesFilterPickerButton(
    { selectedFilter, onClick }: TimeseriesFilterPickerButtonProps,
    ref: Ref<HTMLButtonElement>,
  ) {
    const label = selectedFilter
      ? getDateFilterDisplayName(selectedFilter)
      : t`All time`;

    return (
      <Button ref={ref} onClick={onClick}>
        {label}
      </Button>
    );
  },
);
