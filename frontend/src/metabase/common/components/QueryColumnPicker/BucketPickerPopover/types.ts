import * as Lib from "metabase-lib";
import type { BaseBucketPickerPopoverProps } from "./BaseBucketPickerPopover";

type CommonProps = Pick<
  BaseBucketPickerPopoverProps,
  "query" | "stageIndex" | "isEditing"
>;

export interface BucketPickerPopoverProps extends CommonProps {
  column: Lib.ColumnMetadata;
  buckets: Lib.Bucket[];
  onSelect: (column: Lib.ColumnMetadata) => void;
}
