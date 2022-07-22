import React from "react";

import Header from "metabase/writeback/components/HttpAction/Header";
import HttpAction from "metabase/writeback/components/HttpAction/HttpAction";
import { ActionType, WritebackAction } from "metabase/writeback/types";
import { useWritebackAction } from "../hooks";
import _ from "underscore";
import Actions from "metabase/entities/actions";
import { State } from "metabase-types/store/state";
import { connect } from "react-redux";

import { Container, Content } from "./ActionPage.styled";
import { getHttpActionTemplateTagParameter } from "../utils";

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
    responseHandler,
    onResponseHandlerChange,
    errorHandler,
    onErrorHandlerChange,
  } = useWritebackAction(action);

  const onCommit = React.useCallback(() => {
    if (type === "http") {
      const tags = Object.values(templateTags);
      const parameters = tags
        .filter(tag => tag.type != null)
        .map(getHttpActionTemplateTagParameter)
        .map(param => [param.name, param]);
      const entity = {
        name,
        description,
        ...data,
        template: {
          ...data.template,
          parameters: Object.fromEntries(parameters),
        },
        response_handle: responseHandler || null,
        error_handle: errorHandler || null,
      };
      updateAction(action, entity);
    } else {
      throw new Error("Action type is not supported");
    }
  }, [
    action,
    type,
    name,
    description,
    data,
    templateTags,
    updateAction,
    responseHandler,
    errorHandler,
  ]);
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
        responseHandler={responseHandler}
        onResponseHandlerChange={onResponseHandlerChange}
        errorHandler={errorHandler}
        onErrorHandlerChange={onErrorHandlerChange}
      />
    );
  }

  return (
    <Container>
      <Header
        name={name}
        onNameChange={onNameChange}
        type={type}
        canSave={isDirty && isValid}
        onCommit={onCommit}
      />
      <Content>{content}</Content>
    </Container>
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
