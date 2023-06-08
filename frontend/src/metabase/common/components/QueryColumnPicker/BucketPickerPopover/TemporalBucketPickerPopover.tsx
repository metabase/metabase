import { t } from "ttag";
import * as Lib from "metabase-lib";
import {
  BucketPickerPopover,
  BucketPickerPopoverProps,
} from "./BucketPickerPopover";

function renderTriggerContent(bucket?: Lib.BucketDisplayInfo) {
  return bucket ? t`by ${bucket.displayName.toLowerCase()}` : null;
}

type TemporalBucketPickerPopoverProps = Omit<
  BucketPickerPopoverProps,
  "triggerLabel" | "renderTriggerContent"
>;

export function TemporalBucketPickerPopover(
  props: TemporalBucketPickerPopoverProps,
) {
  return (
    <BucketPickerPopover
      {...props}
      triggerLabel={t`Temporal bucket`}
      renderTriggerContent={renderTriggerContent}
    />
  );
}
