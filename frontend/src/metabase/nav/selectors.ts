import { createSelector } from "reselect";
import { getEngineNativeType } from "metabase/lib/engine";
import { State } from "metabase-types/store";

const getDatabaseList = createSelector(
  (state: State) => state.entities.databases,
  databases => (databases ? Object.values(databases) : []),
);

export const getHasDataAccess = createSelector([getDatabaseList], databases =>
  databases.some(d => !d.is_saved_questions),
);

export const getHasOwnDatabase = createSelector([getDatabaseList], databases =>
  databases.some(d => !d.is_sample && !d.is_saved_questions),
);

export const getHasNativeWrite = createSelector([getDatabaseList], databases =>
  databases.some(d => d.native_permissions === "write"),
);

export const getHasDatabaseWithJsonEngine = createSelector(
  [getDatabaseList],
  databases => databases.some(d => getEngineNativeType(d.engine) === "json"),
);
