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

export const tablePickerValueFromTable = (
  table: Table | TableEntity,
): TablePickerValue => {
  // temporary, for backwards-compatibility in DataStep
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
