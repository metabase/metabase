import React, { useCallback } from "react";
import { useAsyncFn } from "react-use";
import { jt, t } from "ttag";
import { MetabotApi } from "metabase/services";
import { Database, User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import type Metadata from "metabase-lib/metadata/Metadata";
import MetabotPrompt from "../MetabotPrompt";
import MetabotGreeting from "../MetabotGreeting";
import MetabotVisualization from "../MetabotVisualization";
import MetabotDatabasePicker from "../MetabotDatabasePicker/MetabotDatabasePicker";
import { MetabotHeader, MetabotRoot } from "../MetabotLayout";

interface DatabaseMetabotProps {
  database: Database;
  databases: Database[];
  user?: User;
  metadata: Metadata;
  onDatabaseChange: (databaseId: number) => void;
}

const DatabaseMetabot = ({
  database,
  databases,
  user,
  metadata,
  onDatabaseChange,
}: DatabaseMetabotProps) => {
  const [{ value, loading }, run] = useAsyncFn(getQuestionAndResults);

  const handleRun = useCallback(
    (text: string) => {
      run(database, metadata, text);
    },
    [database, metadata, run],
  );

  return (
    <MetabotRoot>
      <MetabotHeader>
        <MetabotGreeting>
          {getGreetingMessage(databases, onDatabaseChange, database, user)}
        </MetabotGreeting>
        {database != null ? (
          <MetabotPrompt
            user={user}
            placeholder={t`Ask something...`}
            isRunning={loading}
            onRun={handleRun}
          />
        ) : (
          <MetabotDatabasePicker
            databases={databases}
            selectedDatabase={database}
            onChange={onDatabaseChange}
          />
        )}
      </MetabotHeader>
      {value && (
        <MetabotVisualization
          question={value.question}
          results={value.results}
        />
      )}
    </MetabotRoot>
  );
};

const getGreetingMessage = (
  databases: Database[],
  onDatabaseChange: (databaseId: number) => void,
  database?: Database,
  user?: User,
) => {
  if (database == null) {
    return t`First, let me know what database you want to ask me about.`;
  }

  const name = user?.first_name;
  const databasePicker = (
    <MetabotDatabasePicker
      inline
      variant="link"
      databases={databases}
      selectedDatabase={database}
      onChange={onDatabaseChange}
    />
  );

  return name
    ? jt`What do you want to know about ${databasePicker}, ${name}?`
    : jt`What do you want to know about ${databasePicker}?`;
};

const getQuestionAndResults = async (
  database: Database,
  metadata: Metadata,
  questionText: string,
) => {
  const card = await MetabotApi.databasePrompt({
    databaseId: database.id,
    question: questionText,
  });
  const question = new Question(card, metadata);
  const results = await question.apiGetResults();

  return { question, results };
};

export default DatabaseMetabot;
