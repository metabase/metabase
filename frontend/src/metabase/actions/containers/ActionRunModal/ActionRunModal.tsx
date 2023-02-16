import React from "react";
import * as Urls from "metabase/lib/urls";
import Actions from "metabase/entities/actions";
import ModalContent from "metabase/components/ModalContent";
import { WritebackAction } from "metabase-types/api";
import { State } from "metabase-types/store";
import { getFormTitle } from "../../utils";
import ActionParametersInputForm from "../ActionParametersInputForm";

interface OwnProps {
  params: RouterParams;
  onClose?: () => void;
}

interface RouterParams {
  actionId: string;
}

interface ActionLoaderProps {
  action: WritebackAction;
}

type ActionRunModalProps = OwnProps & ActionLoaderProps;

const ActionRunModal = ({ action, onClose }: ActionRunModalProps) => {
  const title = getFormTitle(action);

  return (
    <ModalContent title={title} onClose={onClose}>
      <ActionParametersInputForm
        action={action}
        onCancel={onClose}
        onSubmit={() => Promise.reject()}
      />
    </ModalContent>
  );
};

export default Actions.load({
  id: (state: State, props: OwnProps) =>
    Urls.extractEntityId(props.params.actionId),
})(ActionRunModal);
