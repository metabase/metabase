import { merge } from "icepick";
import { useCallback, useMemo } from "react";

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
  } = useGetActionsQuery(actionId != null ? null : skipToken);

  const actionWithOverrides = useMemo(() => {
    const action = actions?.find((action) => action.id === actionId);
    if (action && actionOverrides) {
      return {
        ...action,
        visualization_settings: merge(
          action?.visualization_settings,
          actionOverrides,
        ),
      } as DataGridWritebackAction;
    }
    return action;
  }, [actions, actionOverrides, actionId]);

  const [executeAction] = useExecuteActionMutation();

  const handleSubmit = useCallback(
    async (parameters: ParametersForActionExecution) => {
      const result = await executeAction({
        actionId: actionId as number,
        input: initialValues,
        params: parameters,
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
      />
    </ModalContent>
  );
};
