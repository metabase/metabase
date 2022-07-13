/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";

import Header from "metabase/writeback/components/HttpAction/Header";
import HttpAction from "metabase/writeback/components/HttpAction/HttpAction";
import { ActionType } from "metabase/writeback/types";
import { getActionTemplateTagType } from "metabase/writeback/utils";
import { useWritebackAction } from "../hooks";
import {
  createHttpAction,
  CreateHttpActionPayload,
} from "metabase/query_builder/actions";
import { getTemplateTagParameterTarget } from "metabase/parameters/utils/cards";
import { TemplateTag } from "metabase-types/types/Query";
import { ParameterWithTarget } from "metabase/parameters/types";

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

  const onCommit = React.useCallback(() => {
    if (type === "http") {
      const tags = Object.values(templateTags);
      const parameters = tags
        .filter(tag => tag.type != null)
        .map(getTemplateTagParameter)
        .map(param => [param.name, param]);
      const entity = {
        name,
        description,
        ...data,
        template: {
          ...data.template,
          parameters: Object.fromEntries(parameters),
        },
      };
      createHttpAction(entity);
    } else {
      throw new Error("Action type is not supported");
    }
  }, [type, name, description, data, templateTags, createHttpAction]);

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
    <div className="flex h-full flex-column">
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

function getTemplateTagParameter(tag: TemplateTag): ParameterWithTarget {
  return {
    id: tag.id,
    type: tag["widget-type"] || getActionTemplateTagType(tag),
    target: getTemplateTagParameterTarget(tag),
    name: tag.name,
    slug: tag.name,
    default: tag.default,
  };
}
