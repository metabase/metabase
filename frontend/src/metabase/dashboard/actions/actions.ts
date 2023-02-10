import { t } from "ttag";

import {
  getResponseErrorMessage,
  GenericErrorResponse,
} from "metabase/core/utils/errors";

import { addUndo } from "metabase/redux/undo";

import { ActionsApi, PublicApi } from "metabase/services";

import type {
  ActionDashboardCard,
  ActionFormSubmitResult,
  ActionParametersMapping,
  CardId,
  Dashboard,
  ImplicitQueryAction,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getDashboardType } from "../utils";
import { setDashCardAttributes } from "./core";
import { reloadDashboardCards } from "./data-fetching";

interface DashboardAttributes {
  card_id?: CardId | null;
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

export type ExecuteRowActionPayload = {
  dashboard: Dashboard;
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

function getImplicitActionExecutionMessage(action: ImplicitQueryAction) {
  if (action.kind === "row/create") {
    return t`Successfully saved`;
  }
  if (action.kind === "row/update") {
    return t`Successfully updated`;
  }
  if (action.kind === "row/delete") {
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
  dashboard,
  dashcard,
  parameters,
  dispatch,
  shouldToast = true,
}: ExecuteRowActionPayload): Promise<ActionFormSubmitResult> => {
  const executeAction =
    getDashboardType(dashboard.id) === "public"
      ? PublicApi.executeDashcardAction
      : ActionsApi.execute;

  try {
    const result = await executeAction({
      dashboardId: dashboard.id,
      dashcardId: dashcard.id,
      modelId: dashcard.card_id,
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
    const message =
      getResponseErrorMessage(response) ??
      t`Something went wrong while executing the action`;

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
