import type { EntityPickerModalOptions } from "metabase/common/components/EntityPicker";
import type {
  QuestionPickerItem,
  QuestionPickerOptions,
} from "metabase/common/components/Pickers/QuestionPicker";
import type { TablePickerItem } from "metabase/common/components/Pickers/TablePicker";

export type EntryPickerItem = TablePickerItem | QuestionPickerItem;

export type EntryPickerModalOptions = EntityPickerModalOptions &
  QuestionPickerOptions;
