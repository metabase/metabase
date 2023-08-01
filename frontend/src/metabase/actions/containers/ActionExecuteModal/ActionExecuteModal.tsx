import type { FormikHelpers } from "formik";
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
import { useActionInitialValues } from "../../hooks/use-action-initial-values";
import ActionParametersInputForm from "../ActionParametersInputForm";

export interface Props {
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
}: Props) => {
  const dispatch = useDispatch();

  const {
    error: errorAction,
    isLoading: isLoadingAction,
    data: action,
  } = useActionQuery({ id: actionId });

  const {
    error: errorInitialValues,
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
      if (!action) {
        // TypeScript check - it should never happen
        throw new Error("Unexpected error: action is undefined");
      }

      return dispatch(executeAction({ action, parameters }));
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
  const isLoading = isLoadingAction || isLoadingInitialValues;

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  if (!action) {
    // TypeScript check - this should never happen
    return <LoadingAndErrorWrapper error={t`Failed to load action details`} />;
  }

  return (
    <ModalContent
      data-testid="action-execute-modal"
      title={action.name}
      onClose={onClose}
    >
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
