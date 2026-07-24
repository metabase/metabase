import { useMemo, useState } from "react";
import { t } from "ttag";

import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

interface TimeseriesBucketPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  breakout: Lib.BreakoutClause;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

export function TimeseriesBucketPicker({
  query,
  stageIndex,
  column,
  breakout,
  onChange,
}: TimeseriesBucketPickerProps) {
  const [isOpened, setIsOpened] = useState(false);

  const bucketInfo = useMemo(() => {
    const bucket = Lib.temporalBucket(breakout);
    return bucket ? Lib.displayInfo(query, stageIndex, bucket) : undefined;
  }, [query, stageIndex, breakout]);
  const isExplicitlyUnbucketed = bucketInfo?.shortName === "default";

  const handleChange = (newColumn: Lib.ColumnMetadata) => {
    onChange(newColumn);
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <Button
          rightSection={<Icon name="chevrondown" />}
          data-testid="timeseries-bucket-button"
          onClick={() => setIsOpened(!isOpened)}
        >
          {bucketInfo && !isExplicitlyUnbucketed
            ? bucketInfo.displayName
            : t`Unbinned`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TimeseriesBucketDropdown
          query={query}
          stageIndex={stageIndex}
          column={column}
          bucketInfo={bucketInfo}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface TimeseriesBucketDropdownProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  bucketInfo: Lib.BucketDisplayInfo | undefined;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

function TimeseriesBucketDropdown({
  query,
  stageIndex,
  column,
  bucketInfo,
  onChange,
}: TimeseriesBucketDropdownProps) {
  const availableBuckets = Lib.availableTemporalBuckets(
    query,
    stageIndex,
    column,
  );

  const availableItems = availableBuckets.flatMap((bucket) => {
    const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
    // `availableTemporalBuckets` never returns the `:default` synthetic bucket, but the type
    // permits it; skip it here so the picker's `value: TemporalUnit` contract holds.
    return bucketInfo.shortName === "default"
      ? []
      : [
          {
            bucket,
            value: bucketInfo.shortName,
            label: bucketInfo.displayName,
          },
        ];
  });

  const handleChange = (newValue: TemporalUnit) => {
    const newItem = availableItems.find((item) => item.value === newValue);
    const newBucket = newItem?.bucket ?? null;
    const newColumn = Lib.withTemporalBucket(column, newBucket);
    onChange(newColumn);
  };

  const handleRemove = () => {
    const newColumn = Lib.withTemporalBucket(column, "default");
    onChange(newColumn);
  };

  return (
    <TemporalUnitPicker
      value={
        bucketInfo && bucketInfo.shortName !== "default"
          ? bucketInfo.shortName
          : undefined
      }
      availableItems={availableItems}
      canRemove
      onChange={handleChange}
      onRemove={handleRemove}
    />
  );
}
