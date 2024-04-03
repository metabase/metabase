import TableEntity from "metabase-lib/v1/metadata/Table";
import type { Table } from "metabase-types/api";

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

export const tablePickerValueFromTable = (
  table: Table | TableEntity | null,
): TablePickerValue | null => {
  if (table === null) {
    return null;
  }

  // Temporary, for backward compatibility in DataStep, until entity framework is no more
  if (table instanceof TableEntity) {
    return tablePickerValueFromTableEntity(table);
  }

  return {
    db_id: table.db_id,
    id: table.id,
    schema: table.schema,
  };
};

const tablePickerValueFromTableEntity = (
  table: TableEntity,
): TablePickerValue => {
  return {
    db_id: table.db_id,
    id: table.id,
    schema: table.schema_name ?? table.schema?.name,
  };
};
