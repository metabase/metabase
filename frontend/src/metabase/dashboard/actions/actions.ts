import { addUndo } from "metabase/redux/undo";
import { ActionsApi, PublicApi } from "metabase/services";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import {
  getActionErrorMessage,
  getActionExecutionMessage,
} from "metabase/actions/utils";

import type {
  ActionDashboardCard,
  ActionFormSubmitResult,
  ActionParametersMapping,
  CardId,
  Dashboard,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getDashboardType } from "../utils";
import { setDashCardAttributes } from "./core";
import { closeSidebar, setSidebar } from "./ui";

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
      : ActionsApi.executeDashcardAction;

  try {
    const result = await executeAction({
      dashboardId: dashboard.id,
      dashcardId: dashcard.id,
      modelId: dashcard.card_id,
      parameters,
    });

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
  } catch (error) {
    const message = getActionErrorMessage(error);

    if (shouldToast) {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message,
        }),
      );
    }

    return { success: false, error, message };
  }
};

export const setEditingDashcardId =
  (dashcardId: number | null) => (dispatch: Dispatch) => {
    if (dashcardId != null) {
      dispatch(
        setSidebar({
          name: SIDEBAR_NAME.action,
          props: {
            dashcardId,
          },
        }),
      );
    } else {
      dispatch(closeSidebar());
    }
  };
