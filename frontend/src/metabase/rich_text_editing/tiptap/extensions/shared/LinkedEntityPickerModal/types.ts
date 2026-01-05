import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DashboardPickerItem } from "metabase/common/components/Pickers/DashboardPicker";
import type { QuestionPickerItem } from "metabase/common/components/Pickers/QuestionPicker";
import type {
  DatabaseItem,
  TableItem,
  TablePickerItem,
} from "metabase/common/components/Pickers/TablePicker";

export type DocumentLinkedEntityPickerItem =
  | TablePickerItem
  | QuestionPickerItem
  | CollectionPickerItem
  | DashboardPickerItem;

export type DocumentLinkedEntityPickerItemId =
  DocumentLinkedEntityPickerItem["id"];

export type DocumentLinkedEntityPickerItemModel =
  DocumentLinkedEntityPickerItem["model"];

export type DocumentLinkedEntityPickerItemValue =
  // exclude "schema" item
  | TableItem
  | DatabaseItem
  | QuestionPickerItem
  | CollectionPickerItem
  | DashboardPickerItem;
