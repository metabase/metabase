import React from "react";
import { t } from "ttag";
import MetabotGreeting from "metabase/metabot/components/MetabotGreeting";
import MetabotPrompt from "metabase/metabot/components/MetabotPrompt";
import { Card, Database, User } from "metabase-types/api";

import { HomeMetabotWidgetRoot } from "./HomeMetabotWidget.styled";

interface OwnProps {
  model: Card;
}

interface StateProps {
  user: User;
  database: Database;
  onRun: (prompt: string, databaseId: number) => void;
}

type HomeMetabotWidgetProps = OwnProps & StateProps;

const HomeMetabotWidget = ({
  user,
  database,
  model,
  onRun,
}: HomeMetabotWidgetProps) => {
  const handleRun = (prompt: string) => {
    onRun(prompt, database.id);
  };

  return (
    <HomeMetabotWidgetRoot>
      <MetabotGreeting>
        {t`Hey there, ${user.first_name}! You can ask me things about your data. I’m thinking about the ${database.name} database right now. `}
      </MetabotGreeting>
      <MetabotPrompt
        user={user}
        placeholder={t`Ask something like, how many ${model?.name} have we had over time?`}
        isRunning={false}
        onRun={handleRun}
      />
    </HomeMetabotWidgetRoot>
  );
};

export default HomeMetabotWidget;
