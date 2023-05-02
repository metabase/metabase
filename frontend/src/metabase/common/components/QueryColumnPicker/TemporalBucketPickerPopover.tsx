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
  props: Omit<BucketPickerPopoverProps, "renderTriggerContent">,
) {
  return (
    <BucketPickerPopover
      {...props}
      renderTriggerContent={renderTriggerContent}
    />
  );
}

export default TemporalBucketPickerPopover;
