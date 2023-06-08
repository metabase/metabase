import { t } from "ttag";
import * as Lib from "metabase-lib";
import {
  BucketPickerPopover,
  BucketPickerPopoverProps,
} from "./BucketPickerPopover";

function renderTriggerContent(bucket?: Lib.BucketDisplayInfo) {
  return bucket ? bucket.displayName : t`Unbinned`;
}

type BinningStrategyPickerPopoverProps = Omit<
  BucketPickerPopoverProps,
  "triggerLabel" | "renderTriggerContent"
>;

export function BinningStrategyPickerPopover(
  props: BinningStrategyPickerPopoverProps,
) {
  return (
    <BucketPickerPopover
      {...props}
      triggerLabel={t`Binning strategy`}
      renderTriggerContent={renderTriggerContent}
    />
  );
}
