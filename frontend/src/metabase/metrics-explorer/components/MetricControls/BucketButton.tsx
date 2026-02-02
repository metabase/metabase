import { useMemo, useState } from "react";
import { t } from "ttag";

import { TemporalUnitPicker } from "metabase/querying/filters/components/TemporalUnitPicker";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import S from "./MetricControls.module.css";

const STAGE_INDEX = -1;

interface BucketButtonProps {
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  breakout: Lib.BreakoutClause;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

export function BucketButton({
  query,
  column,
  breakout,
  onChange,
}: BucketButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { bucketInfo, availableItems } = useMemo(() => {
    const bucket = Lib.temporalBucket(breakout);
    const info = bucket ? Lib.displayInfo(query, STAGE_INDEX, bucket) : undefined;
    const buckets = Lib.availableTemporalBuckets(query, STAGE_INDEX, column);

    const items = buckets.map((b) => {
      const bucketDisplayInfo = Lib.displayInfo(query, STAGE_INDEX, b);
      return {
        bucket: b,
        value: bucketDisplayInfo.shortName,
        label: bucketDisplayInfo.displayName,
      };
    });

    return { bucketInfo: info, availableItems: items };
  }, [query, column, breakout]);

  const handleChange = (newValue: TemporalUnit) => {
    const newItem = availableItems.find((item) => item.value === newValue);
    const newBucket = newItem?.bucket ?? null;
    const newColumn = Lib.withTemporalBucket(column, newBucket);
    onChange(newColumn);
    setIsOpen(false);
  };

  const handleRemove = () => {
    const newColumn = Lib.withTemporalBucket(column, null);
    onChange(newColumn);
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
          {bucketInfo ? t`by ${bucketInfo.displayName.toLowerCase()}` : t`Unbinned`}
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
