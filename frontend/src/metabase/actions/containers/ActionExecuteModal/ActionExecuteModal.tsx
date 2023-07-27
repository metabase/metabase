import {
  ParametersForActionExecution,
  WritebackActionId,
} from "metabase-types/api";
import { useActionQuery } from "metabase/common/hooks/use-action-query";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import ActionParametersInputForm from "../ActionParametersInputForm";

import { executeAction } from "../../actions";

interface ActionExecuteModalProps {
  actionId: WritebackActionId;
  initialValues?: ParametersForActionExecution;
  fetchInitialValues?: () => Promise<ParametersForActionExecution>;
  shouldPrefetch?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

const ActionExecuteModal = ({
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
    throw new Error("action is not defined");
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionExecuteModal;
