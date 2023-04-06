import { getEngineNativeType } from "metabase/lib/engine";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import NativeQuery from "metabase-lib/queries/NativeQuery";

export const maybeFixTemplateTags = (question: Question) => {
  const query = question.query();

  if (!(query instanceof NativeQuery)) {
    return question;
  }

  const queryText = query.queryText();
  return query.setQueryText(queryText).question();
};

export const canUseMetabotOnDatabase = (database: Database) => {
  return (
    database.features.includes("nested-queries") &&
    database.canWrite() &&
    getEngineNativeType(database.engine) === "sql"
  );
};
