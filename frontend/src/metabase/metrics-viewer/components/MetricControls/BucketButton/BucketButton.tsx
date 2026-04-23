import { useMemo, useState } from "react";
import { t } from "ttag";

import { TemporalBucketPicker } from "metabase/metrics/components/TemporalBucketPicker";
import type { DimensionWithDefinition } from "metabase/metrics/types";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

type BucketButtonProps = {
  definition: MetricDefinition;
  dimension: DimensionMetadata;
  projection: ProjectionClause;
  onChange: (unit: TemporalUnit | undefined) => void;
};

export function BucketButton({
  definition,
  dimension,
  projection,
  onChange,
}: BucketButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const dimensions = useMemo<DimensionWithDefinition[]>(
    () => [{ definition, dimension }],
    [definition, dimension],
  );

  const currentUnit = useMemo(() => {
    const bucket = LibMetric.temporalBucket(projection);
    return bucket
      ? LibMetric.displayInfo(definition, bucket).shortName
      : undefined;
  }, [definition, projection]);

  const handleChange = (unit: TemporalUnit) => {
    onChange(unit);
    setIsOpen(false);
  };

  const handleRemove = () => {
    onChange(undefined);
    setIsOpen(false);
  };

  return (
    <Popover opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Button
          w={184}
          justify="space-between"
          fw="bold"
          py="xs"
          px="sm"
          variant="subtle"
          color="text-primary"
          rightSection={<Icon name="chevrondown" size={12} />}
          onClick={() => setIsOpen(!isOpen)}
        >
          {currentUnit
            ? t`by ${Lib.describeTemporalUnit(currentUnit).toLowerCase()}`
            : t`Unbinned`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TemporalBucketPicker
          selectedUnit={currentUnit}
          dimensions={dimensions}
          canRemove
          onSelect={handleChange}
          onRemove={handleRemove}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
