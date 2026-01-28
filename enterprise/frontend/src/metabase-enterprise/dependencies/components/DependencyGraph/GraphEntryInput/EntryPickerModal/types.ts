import type { QuestionPickerItem } from "metabase/common/components/Pickers/QuestionPicker";
import type { TablePickerItem } from "metabase/common/components/Pickers/TablePicker";
import type { TransformPickerItem } from "metabase/transforms/components/TransformPicker";

export type EntryPickerItem =
  | TablePickerItem
  | QuestionPickerItem
  | TransformPickerItem;

export type EntryPickerItemId = EntryPickerItem["id"];

export type EntryPickerItemModel = EntryPickerItem["model"];
