import { merge } from "icepick";
import { useCallback, useMemo } from "react";

import { executeAction } from "metabase/actions/actions";
import ActionParametersInputForm from "metabase/actions/containers/ActionParametersInputForm";
import { skipToken, useGetActionQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import type { TableActionsExecuteFormVizOverride } from "metabase/visualizations/types/table-actions";
import type {
  ParametersForActionExecution,
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

  const handleSubmit = useCallback(
    (parameters: ParametersForActionExecution) => {
      const fullParameters = {
        ...initialValues,
        ...parameters,
      };

      return dispatch(
        executeAction({
          action: checkNotNull(action),
          parameters: fullParameters,
        }),
      );
    },
    [initialValues, dispatch, action],
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
