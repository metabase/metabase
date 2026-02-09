import { useMemo, useState } from "react";
import { t } from "ttag";

import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { Button, Icon, Popover } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { DimensionMetadata, MetricDefinition, ProjectionClause } from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import S from "../MetricControls.module.css";

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

  const { bucketInfo, availableItems } = useMemo(() => {
    const bucket = LibMetric.temporalBucket(projection);
    const info = bucket
      ? LibMetric.displayInfo(definition, bucket)
      : undefined;
    const buckets = LibMetric.availableTemporalBuckets(definition, dimension);

    const items = buckets.map((b) => {
      const bucketDisplayInfo = LibMetric.displayInfo(definition, b);
      return {
        bucket: b,
        value: bucketDisplayInfo.shortName,
        label: bucketDisplayInfo.displayName,
      };
    });

    return { bucketInfo: info, availableItems: items };
  }, [definition, dimension, projection]);

  const handleChange = (newValue: TemporalUnit) => {
    onChange(newValue);
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
          className={S.controlButton}
          variant="subtle"
          color="text-primary"
          rightSection={<Icon name="chevrondown" size={12} />}
          onClick={() => setIsOpen(!isOpen)}
        >
          {bucketInfo
            ? t`by ${bucketInfo.displayName.toLowerCase()}`
            : t`Unbinned`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TemporalUnitPicker
          value={bucketInfo?.shortName}
          availableItems={availableItems}
          canRemove
          onChange={handleChange}
          onRemove={handleRemove}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
