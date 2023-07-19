import { useCallback } from "react";
import { connect } from "react-redux";
import { useLatest } from "react-use";
import _ from "underscore";
import Actions from "metabase/entities/actions";
import ModalContent from "metabase/components/ModalContent";
import {
  ActionFormSubmitResult,
  ParametersForActionExecution,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";
import { State } from "metabase-types/store";
import { executeAction, ExecuteActionOpts } from "../../actions";
import ActionParametersInputForm from "../ActionParametersInputForm";

interface OwnProps {
  actionId: WritebackActionId;
  initialValues?: ParametersForActionExecution;
  fetchInitialValues?: () => Promise<ParametersForActionExecution>;
  shouldPrefetch?: boolean;
  onSubmit: (opts: ExecuteActionOpts) => Promise<ActionFormSubmitResult>;
  onClose?: () => void;
  onSuccess?: () => void;
}

interface ActionLoaderProps {
  action: WritebackAction;
}

type ActionExecuteModalProps = OwnProps & ActionLoaderProps;

const mapDispatchToProps = {
  onSubmit: executeAction,
};

const ActionExecuteModal = ({
  action,
  initialValues,
  fetchInitialValues,
  shouldPrefetch,
  onSubmit,
  onClose,
  onSuccess = _.noop,
}: ActionExecuteModalProps) => {
  const onSuccessRef = useLatest(onSuccess);

  const handleSubmit = useCallback(
    async (parameters: ParametersForActionExecution) => {
      const result = await onSubmit({ action, parameters });

      if (result.success) {
        onSuccessRef.current();
      }

      return result;
    },
    [action, onSubmit, onSuccessRef],
  );

  return (
    <ModalContent title={action.name} onClose={onClose}>
      <ActionParametersInputForm
        action={action}
        initialValues={initialValues}
        fetchInitialValues={fetchInitialValues}
        shouldPrefetch={shouldPrefetch}
        onCancel={onClose}
        onSubmit={handleSubmit}
        onSubmitSuccess={onClose}
      />
    </ModalContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Actions.load({
    id: (state: State, props: OwnProps) => props.actionId,
  }),
  connect(null, mapDispatchToProps),
)(ActionExecuteModal);
