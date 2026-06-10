import { actionApi } from "metabase/api";
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
      const result = await dispatch(
        actionApi.endpoints.executeAction.initiate({
          id: action.id,
          parameters,
        }),
      ).unwrap();

      const message = getActionExecutionMessage(action, result);
      dispatch(addUndo({ message, toastColor: "success" }));
      return { success: true, message };
    } catch (error) {
      const message = getActionErrorMessage(error);
      return { success: false, error, message };
    }
  };
