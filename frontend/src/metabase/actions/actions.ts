import { actionApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { Dispatch } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import type {
  ActionFormSubmitResult,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import { getActionErrorMessage, getActionExecutionMessage } from "./utils";

export interface ExecuteActionOpts {
  action: WritebackAction;
  parameters: ParametersForActionExecution;
}

export const executeAction =
  ({ action, parameters }: ExecuteActionOpts) =>
  async (dispatch: Dispatch): Promise<ActionFormSubmitResult> => {
    try {
      const result = await runRtkEndpoint(
        { id: action.id, parameters },
        dispatch,
        actionApi.endpoints.executeAction,
      );

      const message = getActionExecutionMessage(action, result);
      dispatch(addUndo({ message, toastColor: "success" }));
      return { success: true, message };
    } catch (error) {
      const message = getActionErrorMessage(error);
      return { success: false, error, message };
    }
  };
