import React from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import BucketPickerPopover, {
  BucketPickerPopoverProps,
} from "./BucketPickerPopover";

function renderTriggerContent(bucket?: Lib.BucketDisplayInfo) {
  return bucket ? t`by ${bucket.displayName}` : null;
}

function TemporalBucketPickerPopover(
  props: Omit<
    BucketPickerPopoverProps,
    "triggerLabel" | "renderTriggerContent"
  >,
) {
  return (
    <BucketPickerPopover
      {...props}
      triggerLabel={t`Temporal bucket`}
      renderTriggerContent={renderTriggerContent}
    />
  );
}

export default TemporalBucketPickerPopover;
