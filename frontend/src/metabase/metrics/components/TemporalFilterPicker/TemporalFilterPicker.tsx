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

type TemporalFilterPickerProps = {
  dimensions: DimensionWithDefinition[];
  selectedFilter: DatePickerValue | undefined;
  onChange: (filter: DatePickerValue | undefined) => void;
};

export function TemporalFilterPicker({
  dimensions,
  selectedFilter,
  onChange,
}: TemporalFilterPickerProps) {
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

type TemporalFilterPickerButtonProps = {
  selectedFilter: DatePickerValue | undefined;
  onClick?: () => void;
};

export const TemporalFilterPickerButton = forwardRef(
  function TemporalFilterPickerButton(
    { selectedFilter, onClick }: TemporalFilterPickerButtonProps,
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
