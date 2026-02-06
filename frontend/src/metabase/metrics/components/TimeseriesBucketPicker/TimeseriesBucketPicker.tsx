import { type Ref, forwardRef } from "react";
import { t } from "ttag";

import type { DimensionWithDefinition } from "metabase/metrics/types";
import { getCommonTemporalUnits } from "metabase/metrics/utils/dates";
import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

type TimeseriesBucketPickerProps = {
  selectedUnit: TemporalUnit | undefined;
  dimensions: DimensionWithDefinition[];
  onChange: (unit: TemporalUnit) => void;
};

export function TimeseriesBucketPicker({
  selectedUnit,
  dimensions,
  onChange,
}: TimeseriesBucketPickerProps) {
  const sharedUnits = getCommonTemporalUnits(dimensions);
  const sharedUnitItems = sharedUnits.map((unit) => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit),
  }));

  return (
    <TemporalUnitPicker
      value={selectedUnit}
      availableItems={sharedUnitItems}
      onChange={onChange}
    />
  );
}

type TimeseriesBucketPickerButtonProps = {
  selectedUnit: TemporalUnit | undefined;
  onClick?: () => void;
};

export const TimeseriesBucketPickerButton = forwardRef(
  function TimeseriesBucketPickerButton(
    { selectedUnit, onClick }: TimeseriesBucketPickerButtonProps,
    ref: Ref<HTMLButtonElement>,
  ) {
    const label = selectedUnit
      ? Lib.describeTemporalUnit(selectedUnit)
      : t`Unbinned`;

    return (
      <Button ref={ref} onClick={onClick}>
        {label}
      </Button>
    );
  },
);
