/**
 * Redux selectors for the new query flow
 * (used both for new questions and for adding "ad-hoc metrics" to multi-query questions)
 */

import { createSelector } from "reselect";

import { getDatabases } from "metabase/selectors/metadata";
import { getEngineNativeType } from "metabase/lib/engine";

export const getDatabaseList = createSelector([getDatabases], databaseMap =>
  Object.values(databaseMap ?? {}),
);

export const getHasDataAccess = createSelector([getDatabaseList], databases =>
  // This ensures there is at least one real (not saved questions) DB available
  // If there is only the saved questions DB, it doesn't mean a user has data access
  databases.some(db => !db.is_saved_questions),
);

export const getHasOwnDatabase = createSelector(
  [getDatabaseList],
  databases => {
    if (databases.length === 0) {
      return false;
    }
    if (databases.length === 1 && databases[0].name === "Sample Database") {
      return false;
    }
    return true;
  },
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
