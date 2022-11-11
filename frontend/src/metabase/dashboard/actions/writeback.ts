import { t } from "ttag";

import {
  getResponseErrorMessage,
  GenericErrorResponse,
} from "metabase/lib/errors";
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

import { ActionsApi } from "metabase/services";

import type {
  DataAppPage,
  DashboardOrderedCard,
  ActionDashboardCard,
  ParametersForActionExecution,
  ActionFormSubmitResult,
  WritebackAction,
  ActionParametersMapping,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getCardData } from "../selectors";
import { setDashCardAttributes } from "./core";
import { reloadDashboardCards } from "./data-fetching";

export const SET_PAGE_TITLE_TEMPLATE =
  "metabase/data-app/SET_PAGE_TITLE_TEMPLATE";
export const setPageTitleTemplate = createAction(SET_PAGE_TITLE_TEMPLATE);

interface DashboardAttributes {
  card_id?: number | null;
  action?: WritebackAction | null;
  parameter_mappings?: ActionParametersMapping[] | null;
  visualization_settings?: ActionDashboardCard["visualization_settings"];
}

export function updateButtonActionMapping(
  dashCardId: number,
  attributes: DashboardAttributes,
) {
  return (dispatch: Dispatch) => {
    dispatch(
      setDashCardAttributes({
        id: dashCardId,
        attributes: attributes,
      }),
    );
  };
}

export type InsertRowFromDataAppPayload = InsertRowPayload;

export const createRowFromDataApp = (payload: InsertRowFromDataAppPayload) => {
  return async (dispatch: any) => {
    const result = await createRow(payload);
    const { table } = payload;
    if (result?.["created-row"]?.id) {
      dispatch(
        addUndo({
          message: t`Successfully created a new ${table.objectName()}`,
          toastColor: "success",
        }),
      );
    }
  };
};

export type UpdateRowFromDataAppPayload = UpdateRowPayload;

export const updateRowFromDataApp = (payload: UpdateRowFromDataAppPayload) => {
  return async (dispatch: any) => {
    const result = await updateRow(payload);
    if (result?.["rows-updated"]?.length > 0) {
      dispatch(reloadDashboardCards());
    }
  };
};

export type DeleteRowFromDataAppPayload = DeleteRowPayload;

export const deleteRowFromDataApp = (payload: DeleteRowFromDataAppPayload) => {
  return async (dispatch: any) => {
    try {
      const result = await deleteRow(payload);
      if (result?.["rows-deleted"]?.length > 0) {
        dispatch(reloadDashboardCards());
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
  dashCard: DashboardOrderedCard;
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
        dispatch(reloadDashboardCards());
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
  dashCard: DashboardOrderedCard;
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
        dispatch(reloadDashboardCards());
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
  page: DataAppPage;
  dashcard: ActionDashboardCard;
  parameters: ParametersForActionExecution;
  dispatch: Dispatch;
  shouldToast?: boolean;
};

function hasDataFromExplicitAction(result: any) {
  const isInsert = result["created-row"];
  const isUpdate =
    result["rows-affected"] > 0 || result["rows-updated"]?.[0] > 0;
  const isDelete = result["rows-deleted"]?.[0] > 0;
  return !isInsert && !isUpdate && !isDelete;
}

function getImplicitActionExecutionMessage(action: WritebackAction) {
  if (action.slug === "insert") {
    return t`Successfully saved`;
  }
  if (action.slug === "update") {
    return t`Successfully updated`;
  }
  if (action.slug === "delete") {
    return t`Successfully deleted`;
  }
  return t`Successfully ran the action`;
}

function getActionExecutionMessage(action: WritebackAction, result: any) {
  if (action.type === "implicit") {
    return getImplicitActionExecutionMessage(action);
  }
  if (hasDataFromExplicitAction(result)) {
    return t`Success! The action returned: ${JSON.stringify(result)}`;
  }
  return t`${action.name} was run successfully`;
}

export const executeRowAction = async ({
  page,
  dashcard,
  parameters,
  dispatch,
  shouldToast = true,
}: ExecuteRowActionPayload): Promise<ActionFormSubmitResult> => {
  try {
    const result = await ActionsApi.execute({
      dashboardId: page.id,
      dashcardId: dashcard.id,
      modelId: dashcard.card_id,
      slug: dashcard.action?.slug,
      parameters,
    });

    dispatch(reloadDashboardCards());
    const message = getActionExecutionMessage(
      dashcard.action as WritebackAction,
      result,
    );

    if (shouldToast) {
      dispatch(
        addUndo({
          toastColor: "success",
          message,
        }),
      );
    }

    return { success: true, message };
  } catch (err) {
    const response = err as GenericErrorResponse;
    const message = getResponseErrorMessage(
      response,
      t`Something went wrong while executing the action`,
    );

    if (shouldToast) {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message,
        }),
      );
    }

    return { success: false, error: message, message };
  }
};
