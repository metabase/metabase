import { useCallback } from "react";
import { t } from "ttag";

import {
  ParametersForActionExecution,
  WritebackActionId,
} from "metabase-types/api";
import { useActionQuery } from "metabase/common/hooks/use-action-query";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";

import { executeAction } from "../../actions";
import ActionParametersInputForm from "../ActionParametersInputForm";
import { useActionInitialValues } from "../ActionParametersInputForm/ActionParametersInputForm";

interface ActionExecuteModalProps {
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
  } = useActionInitialValues({
    fetchInitialValues,
    initialValues: initialValuesProp,
    shouldPrefetch,
  });

  const handleSubmit = useCallback(
    (parameters: ParametersForActionExecution) => {
      if (!action) {
        // TypeScript check - it should never happen
        throw new Error("Unexpected error: action is undefined");
      }

      return dispatch(executeAction({ action, parameters }));
    },
    [dispatch, action],
  );

  const handleSubmitSuccess = useCallback(() => {
    onClose?.();
    onSuccess?.();
  }, [onClose, onSuccess]);

  const error = errorAction || errorInitialValues;
  const isLoading =
    isLoadingAction || (isLoadingInitialValues && !hasPrefetchedValues);

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  if (!action) {
    // TypeScript check - this should never happen
    return <LoadingAndErrorWrapper error={t`Failed to load action details`} />;
  }

  return (
    <ModalContent title={action.name} onClose={onClose}>
      <ActionParametersInputForm
        action={action}
        initialValues={initialValues}
        prefetchesInitialValues
        onCancel={onClose}
        onSubmit={handleSubmit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    </ModalContent>
  );
};
