import React from "react";
import { connect } from "react-redux";

import Header from "metabase/writeback/components/HttpAction/Header";
import HttpAction from "metabase/writeback/components/HttpAction/HttpAction";
import { ActionType } from "metabase/writeback/types";
import { useWritebackAction } from "../hooks";
import Actions from "metabase/entities/actions";
import {
  createHttpAction,
  CreateHttpActionPayload,
} from "metabase/query_builder/actions";
import { getTemplateTagParameters } from "metabase/parameters/utils/cards";

type Props = {
  createHttpAction: (payload: CreateHttpActionPayload) => void;
};

const CreateActionPage: React.FC<Props> = ({ createHttpAction }) => {
  const [type, setType] = React.useState<ActionType>("http");
  const {
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
  } = useWritebackAction({ type });

  console.log(Actions);

  const onCommit = React.useCallback(() => {
    if (type === "http") {
      const tags = Object.values(templateTags);
      const parameters = getTemplateTagParameters(tags).map(param => [
        param.name,
        param,
      ]);
      const entity = {
        name,
        description,
        parameters: Object.fromEntries(parameters),
        ...data,
      };
      createHttpAction(entity);
    } else {
      throw new Error("Action type is not supported");
    }
  }, [type, name, description, data]);

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
    <div className="flex flex-column h-full">
      <Header
        name={name}
        onNameChange={onNameChange}
        type={type}
        setType={setType}
        canSave={isDirty && isValid}
        onCommit={onCommit}
      />
      <div className="flex-grow bg-white">{content}</div>
    </div>
  );
};

const mapDispatchToProps = (dispatch: any) => ({
  createHttpAction: (payload: CreateHttpActionPayload) =>
    dispatch(createHttpAction(payload)),
});

export default connect(null, mapDispatchToProps)(CreateActionPage);
