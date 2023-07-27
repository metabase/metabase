import { t } from "ttag";

import {
  ParametersForActionExecution,
  WritebackActionId,
} from "metabase-types/api";
import { useActionQuery } from "metabase/common/hooks/use-action-query";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";

import { executeAction } from "../actions";
import ActionParametersInputForm from "./ActionParametersInputForm";

interface ActionExecuteModalProps {
  actionId: WritebackActionId;
  initialValues?: ParametersForActionExecution;
  fetchInitialValues?: () => Promise<ParametersForActionExecution>;
  shouldPrefetch?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

export const ActionExecuteModal = ({
  actionId,
  initialValues,
  fetchInitialValues,
  shouldPrefetch,
  onClose,
  onSuccess,
}: ActionExecuteModalProps) => {
  const dispatch = useDispatch();
  const { error, isLoading, data: action } = useActionQuery({ id: actionId });

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  if (!action) {
    // TypeScript check - this should never happen
    return <LoadingAndErrorWrapper error={t`Failed to load action details`} />;
  }

  const handleSubmit = (parameters: ParametersForActionExecution) => {
    return dispatch(executeAction({ action, parameters }));
  };

  const handleSubmitSuccess = () => {
    onClose?.();
    onSuccess?.();
  };

  return (
    <ModalContent title={action.name} onClose={onClose}>
      <ActionParametersInputForm
        action={action}
        initialValues={initialValues}
        fetchInitialValues={fetchInitialValues}
        shouldPrefetch={shouldPrefetch}
        onCancel={onClose}
        onSubmit={handleSubmit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    </ModalContent>
  );
};
