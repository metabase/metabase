import React from "react";
import * as Urls from "metabase/lib/urls";
import Actions from "metabase/entities/actions";
import { WritebackAction } from "metabase-types/api";
import { State } from "metabase-types/store";
import ActionParametersInputForm from "../ActionParametersInputForm";

interface OwnProps {
  params: RouterParams;
}

interface RouterParams {
  actionId: string;
}

interface ActionLoaderProps {
  action: WritebackAction;
}

type ActionRunModalProps = OwnProps & ActionLoaderProps;

const ActionRunModal = ({ action }: ActionRunModalProps) => {
  return (
    <ActionParametersInputForm
      action={action}
      onSubmit={() => Promise.reject()}
    />
  );
};

export default Actions.load({
  id: (state: State, props: OwnProps) =>
    Urls.extractEntityId(props.params.actionId),
})(ActionRunModal);
