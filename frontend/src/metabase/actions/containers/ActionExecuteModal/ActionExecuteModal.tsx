import type { FormikHelpers } from "formik";
import { useCallback } from "react";

import { skipToken, useGetActionQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { Modal } from "metabase/ui";
import type {
  ParametersForActionExecution,
  WritebackActionId,
} from "metabase-types/api";

import { executeAction } from "../../actions";
import { useActionInitialValues } from "../../hooks/use-action-initial-values";
import ActionParametersInputForm from "../ActionParametersInputForm";

export interface ActionExecuteModalProps {
  opened: boolean;
  actionId: WritebackActionId | undefined;
  initialValues?: ParametersForActionExecution;
  fetchInitialValues?: () => Promise<ParametersForActionExecution>;
  shouldPrefetch?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ActionExecuteModal = ({
  opened,
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
  } = useGetActionQuery(
    actionId != null && opened ? { id: actionId } : skipToken,
  );

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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={action?.name}
      data-testid="action-execute-modal"
    >
      {error || isLoading || !action ? (
        <LoadingAndErrorWrapper error={error} loading={isLoading} />
      ) : (
        <ActionParametersInputForm
          action={action}
          initialValues={initialValues}
          onCancel={onClose}
          onSubmit={handleSubmit}
          onSubmitSuccess={handleSubmitSuccess}
        />
      )}
    </Modal>
  );
};
