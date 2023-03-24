import React from "react";
import { t } from "ttag";
import { DatabaseId, User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import MetabotGreeting from "../MetabotGreeting";
import MetabotPrompt from "../MetabotPrompt";
import { MetabotHeader } from "./HomeMetabot.styled";

interface HomeMetabotProps {
  user: User;
  database: Database;
  model: Question;
  onRun: (query: string, databaseId: DatabaseId) => void;
}

const HomeMetabot = ({ user, database, model, onRun }: HomeMetabotProps) => {
  const handleRun = (prompt: string) => {
    onRun(prompt, database.id);
  };

  return (
    <MetabotHeader>
      <MetabotGreeting>
        {t`Hey there, ${user.first_name}! You can ask me things about your data. I’m thinking about the ${database.name} database right now. `}
      </MetabotGreeting>
      <MetabotPrompt
        user={user}
        placeholder={t`Ask something like, how many ${model?.displayName()} have we had over time?`}
        isRunning={false}
        onRun={handleRun}
      />
    </MetabotHeader>
  );
};

export default HomeMetabot;
