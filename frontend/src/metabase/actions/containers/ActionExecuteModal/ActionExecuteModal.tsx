import type { FormikHelpers } from "formik";
import { useCallback } from "react";

import { useActionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import type {
  ParametersForActionExecution,
  WritebackActionId,
} from "metabase-types/api";

import { executeAction } from "../../actions";
import { useActionInitialValues } from "../../hooks/use-action-initial-values";
import ActionParametersInputForm from "../ActionParametersInputForm";

export interface ActionExecuteModalProps {
  actionId: WritebackActionId | undefined;
  initialValues?: ParametersForActionExecution;
  fetchInitialValues?: () => Promise<ParametersForActionExecution>;
  shouldPrefetch?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

export const ActionExecuteModal = ({
  actionId,
  initialValues: initialValuesProp,
  fetchInitialValues,
  shouldPrefetch,
  onClose,
  onSuccess,
}: ActionExecuteModalProps) => {
  const dispatch = useDispatch();

  const {
    error: errorAction,
    isLoading: isLoadingAction,
    data: action,
  } = useActionQuery({ id: actionId });

  const {
    error: errorInitialValues,
    hasPrefetchedValues,
    initialValues,
    isLoading: isLoadingInitialValues,
    prefetchValues,
  } = useActionInitialValues({
    fetchInitialValues,
    initialValues: initialValuesProp,
    shouldPrefetch,
  });

  const handleSubmit = useCallback(
    (parameters: ParametersForActionExecution) => {
      return dispatch(
        executeAction({
          action: checkNotNull(action),
          parameters,
        }),
      );
    },
    [dispatch, action],
  );

  const handleSubmitSuccess = useCallback(
    (actions: FormikHelpers<ParametersForActionExecution>) => {
      onClose?.();
      onSuccess?.();

      if (shouldPrefetch) {
        prefetchValues();
      } else {
        actions.resetForm();
      }
    },
    [onClose, onSuccess, shouldPrefetch, prefetchValues],
  );

  const error = errorAction || errorInitialValues;
  const isLoading =
    isLoadingAction || (isLoadingInitialValues && !hasPrefetchedValues);

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  const loadedAction = checkNotNull(action);

  return (
    <ModalContent
      data-testid="action-execute-modal"
      title={loadedAction.name}
      onClose={onClose}
    >
      <ActionParametersInputForm
        action={loadedAction}
        initialValues={initialValues}
        prefetchesInitialValues
        onCancel={onClose}
        onSubmit={handleSubmit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    </ModalContent>
  );
};
