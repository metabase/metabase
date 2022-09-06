import { t } from "ttag";

import { createAction } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import {
  createRow,
  updateRow,
  deleteRow,
  updateManyRows,
  deleteManyRows,
  InsertRowPayload,
  UpdateRowPayload,
  DeleteRowPayload,
  BulkUpdatePayload,
  BulkDeletePayload,
} from "metabase/writeback/actions";

import { DashboardWithCards, DashCard } from "metabase-types/types/Dashboard";

import { getCardData } from "../selectors";
import { isVirtualDashCard } from "../utils";
import { fetchCardData } from "./data-fetching";

export const OPEN_ACTION_PARAMETERS_MODAL =
  "metabase/data-app/OPEN_ACTION_PARAMETERS_MODAL";
export const openActionParametersModal = createAction(
  OPEN_ACTION_PARAMETERS_MODAL,
);

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

export type BulkUpdateFromDataAppPayload = Omit<
  BulkUpdatePayload,
  "records"
> & {
  dashCard: DashCard;
  rowIndexes: number[];
  changes: Record<string, unknown>;
};

export const updateManyRowsFromDataApp = (
  payload: BulkUpdateFromDataAppPayload,
) => {
  return async (dispatch: any, getState: any) => {
    function showErrorToast() {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`Something went wrong while updating`,
        }),
      );
    }

    try {
      const { dashCard, rowIndexes, changes, table } = payload;
      const data = getCardData(getState())[dashCard.id][dashCard.card_id];
      const pks = table.primaryKeys();

      const records: Record<string, unknown>[] = [];

      rowIndexes.forEach(rowIndex => {
        const rowPKs: Record<string, unknown> = {};
        pks.forEach(pk => {
          const name = pk.field.name;
          const rawValue = data.data.rows[rowIndex][pk.index];
          const value = pk?.field.isNumeric()
            ? parseInt(rawValue, 10)
            : rawValue;
          rowPKs[name] = value;
        });
        records.push({
          ...changes,
          ...rowPKs,
        });
      });

      const result = await updateManyRows({ records, table });
      if (result?.["rows-updated"] > 0) {
        dispatch(
          fetchCardData(dashCard.card, dashCard, {
            reload: true,
            ignoreCache: true,
          }),
        );
        dispatch(
          addUndo({
            message: t`Successfully updated ${rowIndexes.length} records`,
            toastColor: "success",
          }),
        );
      } else {
        showErrorToast();
      }
    } catch (err) {
      console.error(err);
      showErrorToast();
    }
  };
};

export type BulkDeleteFromDataAppPayload = Omit<BulkDeletePayload, "ids"> & {
  dashCard: DashCard;
  rowIndexes: number[];
};

export const deleteManyRowsFromDataApp = (
  payload: BulkDeleteFromDataAppPayload,
) => {
  return async (dispatch: any, getState: any) => {
    function showErrorToast() {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`Something went wrong while deleting`,
        }),
      );
    }

    try {
      const { dashCard, rowIndexes, table } = payload;
      const data = getCardData(getState())[dashCard.id][dashCard.card_id];
      const pks = table.primaryKeys();

      const ids: Record<string, number | string>[] = [];

      rowIndexes.forEach(rowIndex => {
        const rowPKs: Record<string, number | string> = {};
        pks.forEach(pk => {
          const name = pk.field.name;
          const rawValue = data.data.rows[rowIndex][pk.index];
          const value = pk?.field.isNumeric()
            ? parseInt(rawValue, 10)
            : rawValue;
          rowPKs[name] = value;
        });
        ids.push(rowPKs);
      });

      const result = await deleteManyRows({ ids, table });
      if (result?.["success"]) {
        dispatch(
          fetchCardData(dashCard.card, dashCard, {
            reload: true,
            ignoreCache: true,
          }),
        );
        dispatch(
          addUndo({
            message: t`Successfully deleted ${rowIndexes.length} records`,
            toastColor: "success",
          }),
        );
      } else {
        showErrorToast();
      }
    } catch (err) {
      console.error(err);
      showErrorToast();
    }
  };
};

export type ExecuteRowActionPayload = {
  dashboard: DashboardWithCards;
  parameters: Record<string, unknown>;
};

export const executeRowAction = ({
  dashboard,
  parameters,
}: ExecuteRowActionPayload) => {
  return async function (dispatch: any) {
    try {
      const result = {
        "rows-affected": 0,
      };
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
      } else {
        dispatch(
          addUndo({
            toastColor: "success",
            message: t`Success! The action returned: ${JSON.stringify(result)}`,
          }),
        );
      }
    } catch (err) {
      console.error(err);
      const message =
        (<any>err)?.data?.message ||
        t`Something went wrong while executing the action`;
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message,
        }),
      );
    }
  };
};
