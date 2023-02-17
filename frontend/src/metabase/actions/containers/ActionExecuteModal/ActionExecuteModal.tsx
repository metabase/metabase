import React, { useCallback } from "react";
import { t } from "ttag";
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
  onSubmit: (opts: ExecuteActionOpts) => Promise<ActionFormSubmitResult>;
  onClose?: () => void;
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
  onSubmit,
  onClose,
}: ActionExecuteModalProps) => {
  const title =
    action.parameters.length > 0 ? action.name : t`Run ${action.name}?`;

  const handleSubmit = useCallback(
    (parameters: ParametersForActionExecution) => {
      return onSubmit({ action, parameters });
    },
    [action, onSubmit],
  );
  return (
    <ModalContent title={title} onClose={onClose}>
      <ActionParametersInputForm
        action={action}
        onCancel={onClose}
        onSubmit={handleSubmit}
        onSubmitSuccess={onClose}
      />
    </ModalContent>
  );
};

export default _.compose(
  Actions.load({
    id: (state: State, props: OwnProps) => props.actionId,
  }),
  connect(null, mapDispatchToProps),
)(ActionExecuteModal);
