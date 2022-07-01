import React from "react";
import { QueryClient, QueryClientProvider } from "react-query";

import Header from "metabase/writeback/components/CreateAction/Header";
import CreateHttpAction from "metabase/writeback/components/CreateAction/CreateHttpAction";
import { ActionType } from "metabase/writeback/types";
import { useCreateAction } from "../hooks";

type Props = {};

const queryClient = new QueryClient();

const CreateActionPage: React.FC<Props> = props => {
  return (
    <QueryClientProvider client={queryClient}>
      <CreateActionPageInner />
    </QueryClientProvider>
  );
};

const CreateActionPageInner: React.FC<Props> = props => {
  const [type, setType] = React.useState<ActionType>("http");
  const {
    save,
    name,
    setName,
    description,
    setDescription,
    data,
    setData,
    isDirty,
    isValid,
    isSaving,
  } = useCreateAction(type);

  return (
    <div className="flex flex-col h-full">
      <Header
        name={name}
        setName={setName}
        type={type}
        setType={setType}
        canSave={isDirty && isValid && !isSaving}
        save={save}
      />
      <div className="flex-grow bg-white">
        <CreateAction
          type={type}
          name={name}
          description={description}
          setDescription={setDescription}
          data={data}
          setData={setData}
        />
      </div>
    </div>
  );
};

type InnerProps = {
  type: ActionType;
  name: string;
  description: string;
  setDescription: (description: string) => void;

  data: any;
  setData: any;
};

const CreateAction: React.FC<InnerProps> = ({
  type,
  name,
  description,
  setDescription,
  data,
  setData,
}) => {
  if (type === "http") {
    const { template = {} } = data;
    return (
      <CreateHttpAction
        data={template}
        setData={newData =>
          setData({ ...data, template: { ...template, ...newData } })
        }
        description={description}
        setDescription={setDescription}
      />
    );
  }

  return null;
};

export default CreateActionPage;
