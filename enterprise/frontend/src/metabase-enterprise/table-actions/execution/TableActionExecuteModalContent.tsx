import { merge } from "icepick";
import { useCallback, useMemo } from "react";

import ActionParametersInputForm from "metabase/actions/containers/ActionParametersInputForm";
import {
  getActionErrorMessage,
  getActionExecutionMessage,
} from "metabase/actions/utils";
import { skipToken, useGetActionQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { addUndo } from "metabase/redux/undo";
import type { TableActionsExecuteFormVizOverride } from "metabase/visualizations/types/table-actions";
import { useExecuteActionMutation } from "metabase-enterprise/api";
import type {
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
    error: errorAction,
    isLoading: isLoadingAction,
    data: action,
  } = useGetActionQuery(actionId != null ? { id: actionId } : skipToken);

  const actionWithOverrides = useMemo(() => {
    if (action && actionOverrides) {
      return {
        ...action,
        visualization_settings: merge(
          action?.visualization_settings,
          actionOverrides,
        ),
      };
    }
  }, [action, actionOverrides]);

  const [executeAction] = useExecuteActionMutation();

  const handleSubmit = useCallback(
    async (parameters: ParametersForActionExecution) => {
      const fullParameters = {
        ...initialValues,
        ...parameters,
      };

      const result = await executeAction({
        actionId: actionId as number,
        parameters: fullParameters,
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

  if (errorAction || isLoadingAction) {
    return (
      <LoadingAndErrorWrapper error={errorAction} loading={isLoadingAction} />
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
        action={ensuredAction}
        initialValues={initialValues}
        onCancel={onClose}
        onSubmit={handleSubmit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    </ModalContent>
  );
};
