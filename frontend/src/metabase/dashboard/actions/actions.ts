import {
  getActionErrorMessage,
  getActionExecutionMessage,
} from "metabase/actions/utils";
import { actionApi } from "metabase/api";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import type { Dispatch } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import { PublicApi } from "metabase/services";
import { getDashboardType } from "metabase/utils/dashboard";
import type {
  ActionDashboardCard,
  ActionFormSubmitResult,
  Dashboard,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import { closeSidebar, setSidebar } from "./ui";

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
  const executeActionRequest = {
    dashboardId: dashboard.id,
    dashcardId: dashcard.id,
    modelId: dashcard.card_id,
    parameters,
  };

  try {
    const result =
      getDashboardType(dashboard.id) === "public"
        ? await PublicApi.executeDashcardAction(executeActionRequest)
        : await dispatch(
            actionApi.endpoints.executeDashcardAction.initiate(
              executeActionRequest,
            ),
          ).unwrap();

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
