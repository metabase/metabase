import { type Ref, forwardRef } from "react";

import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { Button } from "metabase/ui";
import type { TemporalUnit } from "metabase-types/api";

import type { ProjectionInfo } from "./types";
import {
  getSharedTemporalUnitItems,
  getSharedTemporalUnits,
  getTemporalUnitLabel,
} from "./utils";

type TimeseriesBucketPickerProps = {
  selectedUnit: TemporalUnit | undefined;
  projections: ProjectionInfo[];
  onChange: (unit: TemporalUnit) => void;
};

export function TimeseriesBucketPicker({
  selectedUnit,
  projections,
  onChange,
}: TimeseriesBucketPickerProps) {
  const sharedUnits = getSharedTemporalUnits(projections);
  const sharedUnitItems = getSharedTemporalUnitItems(sharedUnits);

  return (
    <TemporalUnitPicker
      value={selectedUnit}
      availableItems={sharedUnitItems}
      onChange={onChange}
    />
  );
}

type TimeseriesBucketPickerTargetProps = {
  selectedUnit: TemporalUnit | undefined;
  onClick?: () => void;
};

export const TimeseriesBucketPickerTarget = forwardRef(
  function TimeseriesBucketPickerTarget(
    { selectedUnit, onClick }: TimeseriesBucketPickerTargetProps,
    ref: Ref<HTMLButtonElement>,
  ) {
    return (
      <Button ref={ref} onClick={onClick}>
        {getTemporalUnitLabel(selectedUnit)}
      </Button>
    );
  },
);
