import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DashboardPickerItem } from "metabase/common/components/Pickers/DashboardPicker";
import type { QuestionPickerItem } from "metabase/common/components/Pickers/QuestionPicker";
import type { TablePickerItem } from "metabase/common/components/Pickers/TablePicker";
import type { TransformPickerItem } from "metabase/plugins";

export type EntryPickerItem =
  | TablePickerItem
  | QuestionPickerItem
  | TransformPickerItem
  | CollectionPickerItem
  | DashboardPickerItem;

export type EntryPickerItemId = EntryPickerItem["id"];

export type EntryPickerItemModel = EntryPickerItem["model"];
