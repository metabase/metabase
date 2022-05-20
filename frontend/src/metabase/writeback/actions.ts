import { ActionsApi } from "metabase/services";
import Table from "metabase-lib/lib/metadata/Table";
import { runQuestionQuery } from "metabase/query_builder/actions/querying";
import {
  closeObjectDetail,
  zoomInRow,
} from "metabase/query_builder/actions/object-detail";

export type InsertRowPayload = {
  table: Table;
  values: { [key: string]: number | string };
};

export const INSERT_ROW_FROM_TABLE_VIEW =
  "metabase/qb/INSERT_ROW_FROM_TABLE_VIEW";
export const createRowFromTableView = (payload: InsertRowPayload) => {
  return async (dispatch: any) => {
    const { table, values } = payload;

    const result = await ActionsApi.create({
      type: "query",
      database: table.db_id,
      query: {
        "source-table": table.id,
      },
      create_row: values,
    });

    dispatch.action(INSERT_ROW_FROM_TABLE_VIEW, payload);
    if (result?.["created-row"]?.id) {
      dispatch(zoomInRow({ objectId: result["created-row"].id }));
    }
  };
};

export type UpdateRowPayload = {
  table: Table;
  id: number | string;
  values: { [key: string]: number | string };
};

export const UPDATE_ROW_FROM_OBJECT_DETAIL =
  "metabase/qb/UPDATE_ROW_FROM_OBJECT_DETAIL";
export const updateRowFromObjectDetail = (payload: UpdateRowPayload) => {
  return async (dispatch: any) => {
    const { table, id, values } = payload;
    const field = table.fields.find(field => field.isPK());
    if (!field) {
      throw new Error("Cannot update row from table without a primary key");
    }

    const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
    const result = await ActionsApi.update({
      type: "query",
      database: table.db_id,
      query: {
        "source-table": table.id,
        filter: ["=", field.reference(), pk],
      },
      update_row: values,
    });

    dispatch.action(UPDATE_ROW_FROM_OBJECT_DETAIL, payload);
    if (result?.["rows-updated"]?.length > 0) {
      dispatch(zoomInRow({ objectId: pk }));
    }
  };
};

export type DeleteRowPayload = {
  table: Table;
  id: number | string;
};

export const DELETE_ROW_FROM_OBJECT_DETAIL =
  "metabase/qb/DELETE_ROW_FROM_OBJECT_DETAIL";
export const deleteRowFromObjectDetail = (payload: DeleteRowPayload) => {
  return async (dispatch: any) => {
    const { table, id } = payload;
    const field = table.fields.find(field => field.isPK());
    if (!field) {
      throw new Error("Cannot delete row from table without a primary key");
    }

    const pk = field.isNumeric() && typeof id === "string" ? parseInt(id) : id;
    const result = await ActionsApi.delete({
      type: "query",
      database: table.db_id,
      query: {
        "source-table": table.id,
        filter: ["=", field.reference(), pk],
      },
    });

    dispatch.action(DELETE_ROW_FROM_OBJECT_DETAIL, payload);
    if (result?.["rows-deleted"]?.length > 0) {
      dispatch(closeObjectDetail());
      dispatch(runQuestionQuery());
    }
  };
};
