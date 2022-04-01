/**
 * Redux selectors for the new query flow
 * (used both for new questions and for adding "ad-hoc metrics" to multi-query questions)
 */

import { createSelector } from "reselect";

import { getMetadata, getDatabases } from "metabase/selectors/metadata";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import Question from "metabase-lib/lib/Question";
import { getEngineNativeType } from "metabase/lib/engine";

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

export const getDatabaseList = createSelector([getDatabases], databaseMap =>
  Object.values(databaseMap ?? {}),
);

export const getHasDataAccess = createSelector([getDatabaseList], databases =>
  // This ensures there is at least one real (not saved questions) DB available
  // If there is only the saved questions DB, it doesn't mean a user has data access
  databases.some(db => !db.is_saved_questions),
);

export const getHasNativeWrite = createSelector([getDatabaseList], databases =>
  databases.some(db => db.native_permissions === "write"),
);

const isJsonEngine = database =>
  getEngineNativeType(database.engine) === "json";

export const getHasDbWithJsonEngine = createSelector(
  [getDatabaseList],
  databases =>
    databases.some(db => db.native_permissions === "write" && isJsonEngine(db)),
);
