import type {
  NotebookDataPickerFolderItem,
  NotebookDataPickerValueItem,
  TablePickerValue,
} from "./types";

export const generateKey = (
  dbItem: NotebookDataPickerFolderItem | null,
  schemaItem: NotebookDataPickerFolderItem | null,
  tableItem: NotebookDataPickerValueItem | null,
) => {
  return [dbItem?.id, schemaItem?.id, tableItem?.id].join("-");
};

export const isTablePickerValueEqual = (
  value1: TablePickerValue | null,
  value2: TablePickerValue | null,
) => {
  if (!value1 || !value2) {
    return value1 === value2;
  }

  return (
    value1.db_id === value2.db_id &&
    value1.id === value2.id &&
    value1.schema === value2.schema
  );
};
