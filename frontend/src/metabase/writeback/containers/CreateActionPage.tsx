import React from "react";
import { QueryClient, QueryClientProvider } from "react-query";

import Header from "metabase/writeback/components/CreateAction/Header";
import CreateHttpAction from "metabase/writeback/components/CreateAction/CreateHttpAction";
import {
  ActionType,
  CreateActionData,
  SaveAction,
} from "metabase/writeback/types";
import { useCreateAction } from "../hooks";

type Props = {};

const queryClient = new QueryClient();

const CreateActionPage: React.FC<Props> = props => {
  const [type, setType] = React.useState<ActionType>("http");
  const { save, name, setName, description, setDescription } = useCreateAction(
    type,
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-full">
        <Header name={name} setName={setName} type={type} setType={setType} />
        <div className="flex-grow bg-white">
          <CreateAction
            type={type}
            save={save}
            name={name}
            description={description}
            setDescription={setDescription}
          />
        </div>
      </div>
    </QueryClientProvider>
  );
};

type InnerProps = {
  type: ActionType;
  name: string;
  description: string;
  setDescription: (description: string) => void;

  save: SaveAction;
};

const CreateAction: React.FC<InnerProps> = ({
  type,
  name,
  description,
  setDescription,
}) => {
  if (type === "http") {
    return (
      <CreateHttpAction
        name={name}
        description={description}
        setDescription={setDescription}
      />
    );
  }

  return null;
};

export default CreateActionPage;
