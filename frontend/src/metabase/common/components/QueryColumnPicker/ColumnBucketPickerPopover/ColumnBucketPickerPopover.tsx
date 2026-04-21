import * as Lib from "metabase-lib";

import { BinningStrategyPickerPopover } from "./BinningStrategyPickerPopover";
import { TemporalBucketPickerPopover } from "./TemporalBucketPickerPopover";
import type { CommonBucketPickerProps } from "./types";

interface ColumnBucketPickerPopoverProps extends Omit<
  CommonBucketPickerProps,
  "buckets"
> {
  hasBinning?: boolean;
  hasTemporalBucketing?: boolean;
  className?: string;
  classNames?: {
    root?: string;
    chevronDown?: string;
  };
}

export function ColumnBucketPickerPopover({
  query,
  stageIndex,
  column,
  hasBinning = false,
  hasTemporalBucketing = false,
  ...props
}: ColumnBucketPickerPopoverProps) {
  if (hasBinning) {
    const buckets = Lib.availableBinningStrategies(query, stageIndex, column);

    if (buckets.length > 0) {
      return (
        <BinningStrategyPickerPopover
          {...props}
          query={query}
          stageIndex={stageIndex}
          column={column}
          buckets={buckets}
        />
      );
    }
  }

  if (hasTemporalBucketing) {
    const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);

    if (buckets.length > 0) {
      return (
        <TemporalBucketPickerPopover
          {...props}
          query={query}
          stageIndex={stageIndex}
          column={column}
          buckets={buckets}
        />
      );
    }
  }

  return null;
}
