import { connect } from "react-redux";
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
  onSuccess,
}: ActionExecuteModalProps) => {
  const handleSubmit = (parameters: ParametersForActionExecution) => {
    return onSubmit({ action, parameters });
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
export default _.compose(
  Actions.load({
    id: (state: State, props: OwnProps) => props.actionId,
  }),
  connect(null, mapDispatchToProps),
)(ActionExecuteModal);
