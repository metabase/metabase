/**
 * Redux selectors for the new query flow
 * (used both for new questions and for adding "ad-hoc metrics" to multi-query questions)
 */

import { getMetadata } from "metabase/selectors/metadata";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import Question from "metabase-lib/lib/Question";

export const getCurrentQuery = state => {
  // NOTE Atte Keinänen 8/14/17: This is a useless question that will go away after query lib refactoring
  const question = Question.create({ metadata: getMetadata(state) });
  const datasetQuery = state.new_query.datasetQuery;
  return new StructuredQuery(question, datasetQuery);
};

export const getPlainNativeQuery = state => {
  const metadata = getMetadata(state);
  const question = Question.create({ metadata: getMetadata(state) });
  const databases = metadata
    .databasesList()
    .filter(db => !db.is_saved_questions && db.native_permissions === "write");

  // If we only have a single database, then default to that
  // (native query editor doesn't currently show the db selector if there is only one database available)
  if (databases.length === 1) {
    return new NativeQuery(question).setDatabase(databases[0]);
  } else {
    return new NativeQuery(question);
  }
};

export const getNewQueryOptions = state => state.new_query.newQueryOptions;
