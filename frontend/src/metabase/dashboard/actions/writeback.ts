import { t } from "ttag";

import {
  getResponseErrorMessage,
  GenericErrorResponse,
} from "metabase/lib/errors";
import { createAction } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import { ActionsApi } from "metabase/services";

import type {
  DataAppPage,
  ActionDashboardCard,
  ParametersForActionExecution,
  ActionFormSubmitResult,
  WritebackAction,
  ActionParametersMapping,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

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
