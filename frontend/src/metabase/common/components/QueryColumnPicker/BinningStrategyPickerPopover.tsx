import React from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import {
  BucketPickerPopover,
  BucketPickerPopoverProps,
} from "./BucketPickerPopover";

function renderTriggerContent(bucket?: Lib.BucketDisplayInfo) {
  return bucket ? bucket.displayName : t`Unbinned`;
}

export function BinningStrategyPickerPopover(
  props: Omit<
    BucketPickerPopoverProps,
    "triggerLabel" | "renderTriggerContent"
  >,
) {
  return (
    <BucketPickerPopover
      {...props}
      triggerLabel={t`Binning strategy`}
      renderTriggerContent={renderTriggerContent}
    />
  );
}
