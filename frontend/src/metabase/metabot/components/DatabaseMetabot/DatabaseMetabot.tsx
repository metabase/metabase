import React from "react";
import { jt, t } from "ttag";
import { MetabotApi } from "metabase/services";
import { DatabaseId, User } from "metabase-types/api";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import DatabasePicker from "../DatabasePicker";
import Metabot from "../Metabot";

interface DatabaseMetabotProps {
  database: Database;
  databases: Database[];
  user?: User;
  initialQueryText?: string;
  onDatabaseChange: (databaseId: DatabaseId) => void;
}

const DatabaseMetabot = ({
  database,
  databases,
  user,
  initialQueryText,
  onDatabaseChange,
}: DatabaseMetabotProps) => {
  const handleFetch = async (query: string) => {
    const card = await MetabotApi.databasePrompt({
      databaseId: database.id,
      question: query,
    });

    return new Question(card, database.metadata);
  };

  return (
    <Metabot
      title={getTitle(database, databases, user, onDatabaseChange)}
      placeholder={t`Ask something...`}
      user={user}
      initialQueryText={initialQueryText}
      onFetchQuestion={handleFetch}
    />
  );
};

const getTitle = (
  database: Database,
  databases: Database[],
  user: User | undefined,
  onDatabaseChange: (databaseId: number) => void,
) => {
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

export default DatabaseMetabot;
