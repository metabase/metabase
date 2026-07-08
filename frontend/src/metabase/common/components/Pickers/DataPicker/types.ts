import type {
  OmniPickerDatabaseItem,
  OmniPickerItem,
  OmniPickerQuestionItem,
  OmniPickerSchemaItem,
  OmniPickerTableItem,
} from "../EntityPicker";

export const isQuestionItem = (
  item: OmniPickerItem,
): item is OmniPickerQuestionItem => {
  if (
    item.model === "card" ||
    item.model === "dataset" ||
    item.model === "metric"
  ) {
    return true;
  }
  return false;
};

export const isTableItem = (
  item: OmniPickerItem,
): item is OmniPickerTableItem => {
  return item.model === "table";
};

export const isSchemaItem = (
  item: OmniPickerItem,
): item is OmniPickerSchemaItem => {
  return item.model === "schema";
};

export const isDataPickerValue = (
  item: OmniPickerItem,
): item is OmniPickerTableItem | OmniPickerQuestionItem => {
  return isTableItem(item) || isQuestionItem(item);
};

export type DataPickerValue =
  | Pick<
      OmniPickerTableItem | OmniPickerQuestionItem,
      "model" | "id" | "database_id"
    >
  | Pick<OmniPickerDatabaseItem, "model" | "id">;
