import React from "react";
import { connect, Dispatch } from "react-redux";

import Header from "metabase/writeback/components/HttpAction/Header";
import HttpAction from "metabase/writeback/components/HttpAction/HttpAction";
import { ActionType } from "metabase/writeback/types";
import { useWritebackAction } from "../hooks";
import Actions from "metabase/entities/actions";
import {
  createHttpAction,
  CreateHttpActionPayload,
} from "metabase/query_builder/actions";

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
  } = useWritebackAction({ type });

  console.log(Actions);

  const onCommit = React.useCallback(() => {
    if (type === "http") {
      const entity = { name, description, ...data };
      createHttpAction(entity);
    } else {
      throw new Error("Action type is not supported");
    }
  }, [type, name, description, data]);

  return (
    <div className="flex flex-col h-full">
      <Header
        name={name}
        onNameChange={onNameChange}
        type={type}
        setType={setType}
        canSave={isDirty && isValid}
        onCommit={onCommit}
      />
      <div className="flex-grow bg-white">
        <CreateAction
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

const CreateAction: React.FC<InnerProps> = ({
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
  createHttpAction: (payload: CreateHttpActionPayload) =>
    dispatch(createHttpAction(payload)),
});

export default connect(null, mapDispatchToProps)(CreateActionPage);
