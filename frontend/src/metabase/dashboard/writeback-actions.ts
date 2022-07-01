import { t } from "ttag";

import { EmittersApi } from "metabase/services";
import { addUndo } from "metabase/redux/undo";

import {
  createRow,
  updateRow,
  deleteRow,
  InsertRowPayload,
  UpdateRowPayload,
  DeleteRowPayload,
} from "metabase/writeback/actions";

import { DashboardWithCards, DashCard } from "metabase-types/types/Dashboard";

import { fetchCardData } from "./actions";
import { isVirtualDashCard } from "./utils";

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
