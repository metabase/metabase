import { RowActionsApi } from "metabase/services";
import Table from "metabase-lib/lib/metadata/Table";

export type InsertRowPayload = {
  table: Table;
  values: Record<string, unknown>;
};

export const createRow = (payload: InsertRowPayload) => {
  const { table, values } = payload;
  return RowActionsApi.create({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
    },
    create_row: values,
  });
};

export type UpdateRowPayload = {
  table: Table;
  id: number | string;
  values: Record<string, unknown>;
};

export const updateRow = (payload: UpdateRowPayload) => {
  const { table, id, values } = payload;
  const field = table.fields.find(field => field.isPK());
  if (!field) {
    throw new Error("Cannot update row from table without a primary key");
  }

  const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
  return RowActionsApi.update({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
    update_row: values,
  });
};

export type DeleteRowPayload = {
  table: Table;
  id: number | string;
};

export const deleteRow = (payload: DeleteRowPayload) => {
  const { table, id } = payload;
  const field = table.fields.find(field => field.isPK());
  if (!field) {
    throw new Error("Cannot delete row from table without a primary key");
  }

  const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
  return RowActionsApi.delete({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
  });
};
