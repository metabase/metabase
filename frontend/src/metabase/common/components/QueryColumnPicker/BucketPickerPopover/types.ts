import type { ColorName } from "metabase/lib/colors/types";
import type * as Lib from "metabase-lib";

export interface CommonBucketPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  buckets: Lib.Bucket[];
  isEditing: boolean;
  onSelect: (column: Lib.ColumnMetadata) => void;
  color?: ColorName;
  hasChevronDown?: boolean;
  className?: string;
  classNames?: {
    root?: string;
    chevronDown?: string;
  };
}
