import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { TemporalUnitPicker } from "../../TemporalUnitPicker";

interface TimeseriesBucketPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

export function TimeseriesBucketPicker({
  query,
  stageIndex,
  column,
  onChange,
}: TimeseriesBucketPickerProps) {
  const [isOpened, setIsOpened] = useState(false);

  const columnBucketInfo = useMemo(() => {
    const bucket = Lib.temporalBucket(column);
    return bucket ? Lib.displayInfo(query, stageIndex, bucket) : undefined;
  }, [query, stageIndex, column]);

  const handleChange = (newColumn: Lib.ColumnMetadata) => {
    onChange(newColumn);
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <Button
          rightIcon={<Icon name="chevrondown" />}
          data-testid="timeseries-bucket-button"
          onClick={() => setIsOpened(!isOpened)}
        >
          {columnBucketInfo ? columnBucketInfo.displayName : t`Unbinned`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TimeseriesBucketDropdown
          query={query}
          stageIndex={stageIndex}
          column={column}
          columnBucketInfo={columnBucketInfo}
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
  columnBucketInfo: Lib.BucketDisplayInfo | undefined;
  onChange: (newColumn: Lib.ColumnMetadata) => void;
}

function TimeseriesBucketDropdown({
  query,
  stageIndex,
  column,
  columnBucketInfo,
  onChange,
}: TimeseriesBucketDropdownProps) {
  const availableBuckets = Lib.availableTemporalBuckets(
    query,
    stageIndex,
    column,
  );

  const availableItems = availableBuckets.map(bucket => {
    const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
    return {
      bucket,
      value: bucketInfo.shortName,
      label: bucketInfo.displayName,
    };
  });

  const handleChange = (newValue: TemporalUnit) => {
    const newItem = availableItems.find(item => item.value === newValue);
    const newBucket = newItem?.bucket ?? null;
    const newColumn = Lib.withTemporalBucket(column, newBucket);
    onChange(newColumn);
  };

  const handleRemove = () => {
    const newColumn = Lib.withTemporalBucket(column, null);
    onChange(newColumn);
  };

  return (
    <TemporalUnitPicker
      value={columnBucketInfo?.shortName}
      availableItems={availableItems}
      canRemove
      onChange={handleChange}
      onRemove={handleRemove}
    />
  );
}
