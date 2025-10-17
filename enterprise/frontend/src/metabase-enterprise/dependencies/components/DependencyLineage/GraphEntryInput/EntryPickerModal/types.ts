import type { QuestionPickerItem } from "metabase/common/components/Pickers/QuestionPicker";
import type { TablePickerItem } from "metabase/common/components/Pickers/TablePicker";
import type { TransformPickerItem } from "metabase/plugins";

export type EntryPickerItem =
  | TablePickerItem
  | QuestionPickerItem
  | TransformPickerItem;
