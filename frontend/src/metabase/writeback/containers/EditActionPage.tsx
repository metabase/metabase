import React from "react";

import Header from "metabase/writeback/components/HttpAction/Header";
import HttpAction from "metabase/writeback/components/HttpAction/HttpAction";
import { ActionType, WritebackAction } from "metabase/writeback/types";
import { useWritebackAction } from "../hooks";
import _ from "underscore";
import Actions from "metabase/entities/actions";
import { State } from "metabase-types/store/state";
import { connect } from "react-redux";

type Props = {
  action: WritebackAction;
  updateAction: (
    action: WritebackAction,
    values: Partial<WritebackAction>,
  ) => void;
};

const EditActionPage: React.FC<Props> = ({ action, updateAction }) => {
  const {
    type,
    name,
    onNameChange,
    description,
    onDescriptionChange,
    data,
    onDataChange,
    isDirty,
    isValid,
  } = useWritebackAction(action);

  console.log({ action });

  const onCommit = () => {
    console.log("Eddit on commit");
    const update = (action as any).update;
    updateAction(action, { name, description, ...data });
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        name={name}
        onNameChange={onNameChange}
        type={type}
        canSave={isDirty && isValid}
        onCommit={onCommit}
      />
      <div className="flex-grow bg-white">
        <EditAction
          type={type}
          description={description}
          onDescriptionChange={onDescriptionChange}
          data={data}
          onDataChange={onDataChange}
        />
      </div>
    </div>
  );
};

type InnerProps = {
  type: ActionType;
  description: string;
  onDescriptionChange: (description: string) => void;

  data: any;
  onDataChange: any;
};

const EditAction: React.FC<InnerProps> = ({
  type,
  description,
  onDescriptionChange,
  data,
  onDataChange,
}) => {
  if (type === "http") {
    const { template = {} } = data;
    return (
      <HttpAction
        data={template}
        onDataChange={newData =>
          onDataChange({ ...data, template: { ...template, ...newData } })
        }
        description={description}
        onDescriptionChange={onDescriptionChange}
      />
    );
  }

  return null;
};

const mapDispatchToProps = (dispatch: any) => ({
  updateAction: async (
    action: WritebackAction,
    values: Partial<WritebackAction>,
  ) => {
    await dispatch(Actions.actions.update(action, values));
  },
});

export default _.compose(
  connect(null, mapDispatchToProps),
  Actions.load({
    id: (_state: State, { params }: { params: { actionId: number } }) =>
      params.actionId,
    wrapped: true,
  }),
)(EditActionPage);
