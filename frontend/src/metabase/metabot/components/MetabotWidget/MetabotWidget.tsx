import React, { useCallback, useState } from "react";
import { jt, t } from "ttag";
import { DatabaseId, User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import DatabasePicker from "../DatabasePicker";
import MetabotMessage from "../MetabotMessage";
import MetabotPrompt from "../MetabotPrompt";
import { MetabotHeader } from "./MetabotWidget.styled";

interface MetabotWidgetProps {
  databases: Database[];
  model?: Question;
  user?: User;
  onRun: (databaseId: DatabaseId, query: string) => void;
}

const MetabotWidget = ({
  databases,
  model,
  user,
  onRun,
}: MetabotWidgetProps) => {
  const initialDatabaseId = model?.databaseId() ?? databases[0]?.id;
  const [databaseId, setDatabaseId] = useState(initialDatabaseId);

  const handleRun = useCallback(
    (query: string) => {
      onRun(databaseId, query);
    },
    [databaseId, onRun],
  );

  return (
    <MetabotHeader>
      <MetabotMessage>
        {getGreetingMessage(user)} {t`You can ask me things about your data.`}{" "}
        {databases.length > 1 &&
          jt`I’m thinking about the ${(
            <DatabasePicker
              key="picker"
              databases={databases}
              selectedDatabaseId={databaseId}
              onChange={setDatabaseId}
            />
          )} database right now.`}
      </MetabotMessage>
      <MetabotPrompt
        user={user}
        placeholder={getPromptPlaceholder(model)}
        onRun={handleRun}
      />
    </MetabotHeader>
  );
};

const getGreetingMessage = (user?: User) => {
  if (user?.first_name) {
    return t`Hey there, ${user?.first_name}!`;
  } else {
    return t`Hey there!`;
  }
};

const getPromptPlaceholder = (model?: Question) => {
  if (model) {
    return t`Ask something like, how many ${model?.displayName()} have we had over time?`;
  } else {
    return t`Ask something…`;
  }
};

export default MetabotWidget;
