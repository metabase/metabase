import React, { useCallback, useEffect } from "react";
import { useAsyncFn } from "react-use";
import { jt, t } from "ttag";
import { MetabotApi } from "metabase/services";
import { User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import MetabaseEmptyState from "../MetabotEmptyState";
import DatabasePicker from "../DatabasePicker/DatabasePicker";
import MetabotGreeting from "../MetabotGreeting";
import MetabotPrompt from "../MetabotPrompt";
import MetabotQueryBuilder from "../MetabotQueryBuilder";
import { MetabotHeader, MetabotRoot } from "../MetabotLayout";

interface DatabaseMetabotProps {
  database: Database;
  databases: Database[];
  user?: User;
  initialQuery?: string;
  onDatabaseChange: (databaseId: number) => void;
}

const DatabaseMetabot = ({
  database,
  databases,
  user,
  initialQuery,
  onDatabaseChange,
}: DatabaseMetabotProps) => {
  const [{ value, loading }, run] = useAsyncFn(getQuestionAndResults);

  const handleRun = useCallback(
    (query: string) => {
      run(database, query);
    },
    [database, run],
  );

  useEffect(() => {
    if (initialQuery) {
      run(database, initialQuery);
    }
  }, [database, initialQuery, run]);

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
            initialQuery={initialQuery}
            isRunning={loading}
            onRun={handleRun}
          />
        ) : (
          <DatabasePicker databases={databases} onChange={onDatabaseChange} />
        )}
      </MetabotHeader>
      {value ? (
        <MetabotQueryBuilder
          question={value.question}
          results={value.results}
        />
      ) : (
        <MetabaseEmptyState />
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
    <DatabasePicker
      databases={databases}
      selectedDatabaseId={database.id}
      onChange={onDatabaseChange}
    />
  );

  return name
    ? jt`What do you want to know about ${databasePicker}, ${name}?`
    : jt`What do you want to know about ${databasePicker}?`;
};

const getQuestionAndResults = async (database: Database, query: string) => {
  const card = await MetabotApi.databasePrompt({
    databaseId: database.id,
    question: query,
  });
  const question = new Question(card, database.metadata);
  const results = await question.apiGetResults();

  return { question, results };
};

export default DatabaseMetabot;
