import { t } from "ttag";

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

export const executeRowAction = async ({
  page,
  dashcard,
  parameters,
  dispatch,
  shouldToast = true,
}: ExecuteRowActionPayload): Promise<ActionFormSubmitResult> => {
  let message = "";
  try {
    const result = await ActionsApi.execute({
      dashboardId: page.id,
      dashcardId: dashcard.id,
      modelId: dashcard.card_id,
      slug: dashcard.action?.slug,
      parameters,
    });

    if (result["rows-affected"] > 0 || result["rows-updated"]?.[0] > 0) {
      message = t`Successfully executed the action`;
    } else if (result["created-row"]) {
      message = t`Successfully saved`;
    } else if (result["rows-deleted"]?.[0] > 0) {
      message = t`Successfully deleted`;
    } else {
      message = t`Success! The action returned: ${JSON.stringify(result)}`;
    }
    dispatch(reloadDashboardCards());
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
    const message =
      (<any>err)?.data?.message ||
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
