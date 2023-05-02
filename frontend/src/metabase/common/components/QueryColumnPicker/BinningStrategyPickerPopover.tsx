import React from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import BucketPickerPopover, {
  BucketPickerPopoverProps,
} from "./BucketPickerPopover";

function renderTriggerContent(bucket?: Lib.BucketDisplayInfo) {
  if (!bucket) {
    return null;
  }
  if (bucket.displayName === "Don''t bin") {
    return t`Unbinned`;
  }
  if (bucket.displayName === "Auto bin") {
    return t`Auto binned`;
  }
  return bucket.displayName;
}

function BinningStrategyPickerPopover(
  props: Omit<BucketPickerPopoverProps, "renderTriggerContent">,
) {
  return (
    <BucketPickerPopover
      {...props}
      renderTriggerContent={renderTriggerContent}
    />
  );
}

export default BinningStrategyPickerPopover;
