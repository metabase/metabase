import { t } from "ttag";

import { isVirtualDashCard } from "metabase/dashboard/utils";
import { ActionsApi, EmittersApi } from "metabase/services";
import Table from "metabase-lib/lib/metadata/Table";

import { addUndo } from "metabase/redux/undo";

import { fetchCardData } from "metabase/dashboard/actions";
import { runQuestionQuery } from "metabase/query_builder/actions/querying";
import { setUIControls } from "metabase/query_builder/actions/ui";
import { closeObjectDetail } from "metabase/query_builder/actions/object-detail";

import { DashboardWithCards, DashCard } from "metabase-types/types/Dashboard";

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
    const { table } = payload;
    if (result?.["created-row"]?.id) {
      const { dashCard } = payload;
      dispatch(
        fetchCardData(dashCard.card, dashCard, {
          reload: true,
          ignoreCache: true,
        }),
      );
      dispatch(
        addUndo({
          message: t`Successfully inserted a row into the ${table.displayName()} table`,
          toastColor: "success",
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
    try {
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
    } catch (err) {
      console.error(err);
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`Something went wrong while deleting the row`,
        }),
      );
    }
  };
};

export type ExecuteRowActionPayload = {
  dashboard: DashboardWithCards;
  emitterId: number;
  parameters: Record<string, unknown>;
};

export const executeRowAction = ({
  dashboard,
  emitterId,
  parameters,
}: ExecuteRowActionPayload) => {
  return async function(dispatch: any) {
    try {
      const result = await EmittersApi.execute({
        id: emitterId,
        parameters,
      });
      if (result["rows-affected"] > 0) {
        dashboard.ordered_cards
          .filter(dashCard => !isVirtualDashCard(dashCard))
          .forEach(dashCard =>
            dispatch(
              fetchCardData(dashCard.card, dashCard, {
                reload: true,
                ignoreCache: true,
              }),
            ),
          );
        dispatch(
          addUndo({
            toastColor: "success",
            message: t`Successfully executed the action`,
          }),
        );
      }
    } catch (err) {
      console.error(err);
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`Something went wrong while executing the action`,
        }),
      );
    }
  };
};
