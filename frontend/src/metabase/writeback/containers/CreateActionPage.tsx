import React from "react";

import Header, {
  ActionType,
} from "metabase/writeback/components/CreateAction/Header";
import CreateHttpAction from "metabase/writeback/components/CreateAction/CreateHttpAction";

type Props = {};

const CreateActionPage: React.FC<Props> = props => {
  const [actionType, setActionType] = React.useState<ActionType>("http");

  return (
    <div className="flex flex-col h-full">
      <Header actionType={actionType} setActionType={setActionType} />
      <div className="flex-grow bg-white">
        <CreateAction actionType={actionType} />
      </div>
    </div>
  );
};

type InnerProps = { actionType: ActionType };

const CreateAction: React.FC<InnerProps> = ({ actionType }) => {
  if (actionType === "http") {
    return <CreateHttpAction />;
  }

  return null;
};

export default CreateActionPage;
