import type * as Lib from "metabase-lib";

import type { BaseBucketPickerPopoverProps } from "./BaseBucketPickerPopover";

type CommonProps = Pick<
  BaseBucketPickerPopoverProps,
  | "query"
  | "stageIndex"
  | "isEditing"
  | "color"
  | "hasArrowIcon"
  | "hasChevronDown"
>;

export interface CommonBucketPickerProps extends CommonProps {
  column: Lib.ColumnMetadata;
  buckets: Lib.Bucket[];
  onSelect: (column: Lib.ColumnMetadata) => void;
}
