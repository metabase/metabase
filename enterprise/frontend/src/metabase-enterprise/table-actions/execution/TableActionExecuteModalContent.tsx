import type { FormikContextType } from "formik";
import { merge } from "icepick";
import { useCallback, useMemo, useRef } from "react";
import _ from "underscore";

import ActionParametersInputForm from "metabase/actions/containers/ActionParametersInputForm";
import {
  getActionErrorMessage,
  getActionExecutionMessage,
} from "metabase/actions/utils";
import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { addUndo } from "metabase/redux/undo";
import type { TableActionsExecuteFormVizOverride } from "metabase/visualizations/types/table-actions";
import {
  useExecuteActionMutation,
  useGetActionsQuery,
} from "metabase-enterprise/api";
import type {
  DataGridWritebackAction,
  DataGridWritebackActionId,
  ParametersForActionExecution,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

export interface TableActionExecuteModalProps {
  actionId: WritebackActionId | undefined;
  initialValues: ParametersForActionExecution;
  actionOverrides?: TableActionsExecuteFormVizOverride;
  onClose?: () => void;
  onSuccess?: () => void;
}

type ActionWithOverrides = Omit<DataGridWritebackAction, "id"> & {
  id: DataGridWritebackActionId | string;
};

export const TableActionExecuteModalContent = ({
  actionId,
  initialValues,
  actionOverrides,
  onClose,
  onSuccess,
}: TableActionExecuteModalProps) => {
  const dispatch = useDispatch();

  const {
    data: actions,
    isLoading: isLoadingActions,
    error: errorActions,
    // TODO: Replace with `describe` API.
  } = useGetActionsQuery(actionId != null ? null : skipToken);

  const actionWithOverrides = useMemo<ActionWithOverrides | undefined>(() => {
    const action = actions?.find((action) => action.id === actionId);
    if (action && actionOverrides) {
      return {
        ...action,
        id: actionOverrides.id || action.id,
        visualization_settings: merge(
          action?.visualization_settings,
          actionOverrides,
        ),
      };
    }
    return action;
  }, [actions, actionOverrides, actionId]);

  const [executeAction] = useExecuteActionMutation();

  /*
    Hacky way to get the internal context of ActionParametersInputForm
    without introducing unpredictable changes to ActionForm component.
  */
  const actionParametersFormContextRef =
    useRef<FormikContextType<ParametersForActionExecution>>();
  const setActionParametersFormContext = useCallback(
    (context: FormikContextType<ParametersForActionExecution>) => {
      actionParametersFormContextRef.current = context;
    },
    [],
  );
  const handleSubmit = useCallback(
    async (parameters: ParametersForActionExecution) => {
      const formInitialValues =
        actionParametersFormContextRef.current?.initialValues;
      const changedFields: ParametersForActionExecution = {};
      Object.keys(parameters).forEach((key) => {
        if (formInitialValues) {
          if (!_.isEqual(parameters[key], formInitialValues[key])) {
            changedFields[key] = parameters[key];
          }
        } else {
          changedFields[key] = parameters[key];
        }
      });

      const executeActionId = actionWithOverrides?.id || actionId;
      if (!executeActionId) {
        return { success: false, error: new Error("Action ID is required") };
      }

      const result = await executeAction({
        actionId: executeActionId,
        input: initialValues,
        params: changedFields,
      });
      if (!result.error) {
        const message = getActionExecutionMessage(
          actionWithOverrides as WritebackAction,
          result.data,
        );
        dispatch(addUndo({ message, toastColor: "success" }));
        return { success: true, message };
      }

      const message = getActionErrorMessage(result.error);
      dispatch(addUndo({ message, toastColor: "error" }));
      return { success: false, error: result.error, message };
    },
    [executeAction, initialValues, actionId, actionWithOverrides, dispatch],
  );

  const handleSubmitSuccess = useCallback(() => {
    onClose?.();
    onSuccess?.();
  }, [onClose, onSuccess]);

  if (errorActions || isLoadingActions) {
    return (
      <LoadingAndErrorWrapper error={errorActions} loading={isLoadingActions} />
    );
  }

  const ensuredAction = checkNotNull(actionWithOverrides);

  return (
    <ModalContent
      data-testid="table-action-execute-modal"
      title={actionOverrides?.name || ensuredAction.name}
      onClose={onClose}
    >
      <ActionParametersInputForm
        action={ensuredAction as WritebackAction}
        initialValues={initialValues}
        onCancel={onClose}
        onSubmit={handleSubmit}
        onSubmitSuccess={handleSubmitSuccess}
        onContextUpdate={setActionParametersFormContext}
      />
    </ModalContent>
  );
};
