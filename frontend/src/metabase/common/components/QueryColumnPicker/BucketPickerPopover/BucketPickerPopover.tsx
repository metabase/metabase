import * as Lib from "metabase-lib";

import {
  BaseBucketPickerPopover,
  INITIALLY_VISIBLE_ITEMS_COUNT,
} from "./BaseBucketPickerPopover";
import { BinningStrategyPickerPopover } from "./BinningStrategyPickerPopover";
import { TemporalBucketPickerPopover } from "./TemporalBucketPickerPopover";
import type { CommonBucketPickerProps } from "./types";

interface BucketPickerPopoverProps
  extends Omit<CommonBucketPickerProps, "buckets"> {
  hasBinning?: boolean;
  hasTemporalBucketing?: boolean;
}

function _BucketPickerPopover({
  query,
  stageIndex,
  column,
  hasBinning = false,
  hasTemporalBucketing = false,
  ...props
}: BucketPickerPopoverProps) {
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

export { INITIALLY_VISIBLE_ITEMS_COUNT };

export const BucketPickerPopover = Object.assign(_BucketPickerPopover, {
  displayName: "BucketPickerPopover",
  TriggerButton: BaseBucketPickerPopover.TriggerButton,
});
