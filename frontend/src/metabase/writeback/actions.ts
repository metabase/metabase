import { ActionsApi } from "metabase/services";
import Table from "metabase-lib/lib/metadata/Table";

import { fetchCardData } from "metabase/dashboard/actions";
import { runQuestionQuery } from "metabase/query_builder/actions/querying";
import { setUIControls } from "metabase/query_builder/actions/ui";
import { closeObjectDetail } from "metabase/query_builder/actions/object-detail";

import { DashCard } from "metabase-types/types/Dashboard";

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

export const INSERT_ROW_FROM_TABLE_VIEW =
  "metabase/qb/INSERT_ROW_FROM_TABLE_VIEW";
export const createRowFromTableView = (payload: InsertRowPayload) => {
  return async (dispatch: any) => {
    const result = await createRow(payload);
    dispatch.action(INSERT_ROW_FROM_TABLE_VIEW, payload);
    if (result?.["created-row"]?.id) {
      dispatch(setUIControls({ modal: null, modalContext: null }));
      dispatch(runQuestionQuery());
    }
  };
};

export type InsertRowFromDataAppPayload = InsertRowPayload & {
  dashCard: DashCard;
};

export const createRowFromDataApp = (payload: InsertRowFromDataAppPayload) => {
  return async (dispatch: any) => {
    const result = await createRow(payload);
    if (result?.["created-row"]?.id) {
      const { dashCard } = payload;
      dispatch(
        fetchCardData(dashCard.card, dashCard, {
          reload: true,
          ignoreCache: true,
        }),
      );
    }
  };
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

export const UPDATE_ROW_FROM_OBJECT_DETAIL =
  "metabase/qb/UPDATE_ROW_FROM_OBJECT_DETAIL";
export const updateRowFromObjectDetail = (payload: UpdateRowPayload) => {
  return async (dispatch: any) => {
    const result = await updateRow(payload);
    dispatch.action(UPDATE_ROW_FROM_OBJECT_DETAIL, payload);
    if (result?.["rows-updated"]?.length > 0) {
      dispatch(closeObjectDetail());
      dispatch(runQuestionQuery());
    }
  };
};

export type UpdateRowFromDataAppPayload = UpdateRowPayload & {
  dashCard: DashCard;
};

export const updateRowFromDataApp = (payload: UpdateRowFromDataAppPayload) => {
  return async (dispatch: any) => {
    const result = await updateRow(payload);
    if (result?.["rows-updated"]?.length > 0) {
      const { dashCard } = payload;
      dispatch(
        fetchCardData(dashCard.card, dashCard, {
          reload: true,
          ignoreCache: true,
        }),
      );
    }
  };
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
  return ActionsApi.delete({
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: ["=", field.reference(), pk],
    },
  });
};

export const DELETE_ROW_FROM_OBJECT_DETAIL =
  "metabase/qb/DELETE_ROW_FROM_OBJECT_DETAIL";
export const deleteRowFromObjectDetail = (payload: DeleteRowPayload) => {
  return async (dispatch: any) => {
    const result = await deleteRow(payload);

    dispatch.action(DELETE_ROW_FROM_OBJECT_DETAIL, payload);
    if (result?.["rows-deleted"]?.length > 0) {
      dispatch(closeObjectDetail());
      dispatch(runQuestionQuery());
    }
  };
};

export type DeleteRowFromDataAppPayload = DeleteRowPayload & {
  dashCard: DashCard;
};

export const deleteRowFromDataApp = (payload: DeleteRowFromDataAppPayload) => {
  return async (dispatch: any) => {
    const result = await deleteRow(payload);
    if (result?.["rows-deleted"]?.length > 0) {
      const { dashCard } = payload;
      dispatch(
        fetchCardData(dashCard.card, dashCard, {
          reload: true,
          ignoreCache: true,
        }),
      );
    }
  };
};
