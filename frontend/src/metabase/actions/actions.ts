import { addUndo } from "metabase/redux/undo";
import { ActionsApi } from "metabase/services";
import type {
  ActionFormSubmitResult,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getActionErrorMessage, getActionExecutionMessage } from "./utils";

export interface ExecuteActionOpts {
  action: WritebackAction;
  parameters: ParametersForActionExecution;
}

export const executeAction =
  ({ action, parameters }: ExecuteActionOpts) =>
  async (dispatch: Dispatch): Promise<ActionFormSubmitResult> => {
    try {
      const result = await ActionsApi.execute({
        id: action.id,
        parameters,
      });

      const message = getActionExecutionMessage(action, result);
      dispatch(addUndo({ message, toastColor: "success" }));
      return { success: true, message };
    } catch (error) {
      const message = getActionErrorMessage(error);
      return { success: false, error, message };
    }
  };
