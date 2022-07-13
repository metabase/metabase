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

const EditActionPage: React.FC<Props> = ({ action, updateAction }: Props) => {
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
    templateTags,
    setTemplateTags,
  } = useWritebackAction(action);

  console.log({ action });

  const onCommit = () => {
    console.log("Eddit on commit");
    const update = (action as any).update;
    updateAction(action, { name, description, ...data });
  };

  let content = null;
  if (type === "http") {
    const { template = {} } = data;
    content = (
      <HttpAction
        data={template}
        onDataChange={newData =>
          onDataChange({ ...data, template: { ...template, ...newData } })
        }
        templateTags={templateTags}
        onTemplateTagsChange={setTemplateTags}
        description={description}
        onDescriptionChange={onDescriptionChange}
      />
    );
  }

  return (
    <div className="flex flex-column full-height">
      <Header
        name={name}
        onNameChange={onNameChange}
        type={type}
        canSave={isDirty && isValid}
        onCommit={onCommit}
      />
      <div className="flex-grow bg-white">{content}</div>
    </div>
  );
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
