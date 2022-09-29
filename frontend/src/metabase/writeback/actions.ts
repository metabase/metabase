import { ActionsApi } from "metabase/services";

import type { Value } from "metabase-types/types/Dataset";
import type Table from "metabase-lib/lib/metadata/Table";

export type InsertRowPayload = {
  table: Table;
  values: Record<string, unknown>;
};

export const createRow = (payload: InsertRowPayload) => {
  const { table, values } = payload;
  return ActionsApi.create({
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
  id: Value;
  values: Record<string, unknown>;
};

export const updateRow = (payload: UpdateRowPayload) => {
  const { table, id, values } = payload;
  const field = table.fields.find(field => field.isPK());
  if (!field) {
    throw new Error("Cannot update row from table without a primary key");
  }

  const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
  return ActionsApi.update({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
    update_row: values,
  });
};

export type BulkUpdatePayload = {
  table: Table;
  records: Record<string, unknown>[];
};

export const updateManyRows = (payload: BulkUpdatePayload) => {
  const { table, records } = payload;
  return ActionsApi.bulkUpdate(
    {
      tableId: table.id,
      body: records,
    },
    { bodyParamName: "body" },
  );
};

export type DeleteRowPayload = {
  table: Table;
  id: Value;
};

export const deleteRow = (payload: DeleteRowPayload) => {
  const { table, id } = payload;
  const field = table.fields.find(field => field.isPK());
  if (!field) {
    throw new Error("Cannot delete row from table without a primary key");
  }

  const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
  return ActionsApi.delete({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
  });
};

export type BulkDeletePayload = {
  table: Table;
  ids: Record<string, number | string>[];
};

export const deleteManyRows = (payload: BulkDeletePayload) => {
  const { table, ids } = payload;
  return ActionsApi.bulkDelete(
    {
      tableId: table.id,
      body: ids,
    },
    { bodyParamName: "body" },
  );
};
