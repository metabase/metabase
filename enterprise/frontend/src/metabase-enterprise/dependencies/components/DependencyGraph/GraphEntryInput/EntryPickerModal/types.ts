import type { OmniPickerItem } from "metabase/common/components/Pickers/EntityPicker/types";

export type EntryPickerItem = Omit<OmniPickerItem, "model"> & {
  model:
    | "question"
    | "model"
    | "metric"
    | "table"
    | "transform"
    | "card"
    | "dashboard"
    | "dataset";
};

export type EntryPickerItemId = EntryPickerItem["id"];

export type EntryPickerItemModel = EntryPickerItem["model"];
