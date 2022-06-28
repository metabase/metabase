import React from "react";
import { QueryClient, QueryClientProvider } from "react-query";

import Header, {
  ActionType,
} from "metabase/writeback/components/CreateAction/Header";
import CreateHttpAction from "metabase/writeback/components/CreateAction/CreateHttpAction";

type Props = {};

const queryClient = new QueryClient();

const CreateActionPage: React.FC<Props> = props => {
  const [actionName, setActionName] = React.useState<string>("New Action");
  const [actionType, setActionType] = React.useState<ActionType>("http");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-full">
        <Header
          actionName={actionName}
          setActionName={setActionName}
          actionType={actionType}
          setActionType={setActionType}
        />
        <div className="flex-grow bg-white">
          <CreateAction actionType={actionType} actionName={actionName} />
        </div>
      </div>
    </QueryClientProvider>
  );
};

type InnerProps = { actionType: ActionType; actionName: string };

const CreateAction: React.FC<InnerProps> = ({ actionType, actionName }) => {
  if (actionType === "http") {
    return <CreateHttpAction actionName={actionName} />;
  }

  return null;
};

export default CreateActionPage;
