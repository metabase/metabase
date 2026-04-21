import { type Ref, forwardRef } from "react";
import { t } from "ttag";

import type { DimensionWithDefinition } from "metabase/metrics/types";
import { getCommonTemporalUnits } from "metabase/metrics/utils/dates";
import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

type TemporalBucketPickerProps = {
  selectedUnit: TemporalUnit | undefined;
  dimensions: DimensionWithDefinition[];
  canRemove?: boolean;
  onSelect: (unit: TemporalUnit) => void;
  onRemove?: () => void;
};

export function TemporalBucketPicker({
  selectedUnit,
  dimensions,
  canRemove,
  onSelect,
  onRemove,
}: TemporalBucketPickerProps) {
  const sharedUnits = getCommonTemporalUnits(dimensions);
  const sharedUnitItems = sharedUnits.map((unit) => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit),
  }));

  return (
    <TemporalUnitPicker
      value={selectedUnit}
      availableItems={sharedUnitItems}
      canRemove={canRemove}
      onChange={onSelect}
      onRemove={onRemove}
    />
  );
}

type TemporalBucketPickerButtonProps = {
  selectedUnit: TemporalUnit | undefined;
  onClick?: () => void;
};

export const TemporalBucketPickerButton = forwardRef(
  function TemporalBucketPickerButton(
    { selectedUnit, onClick }: TemporalBucketPickerButtonProps,
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
