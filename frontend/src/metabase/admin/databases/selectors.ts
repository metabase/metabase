import type { State } from "metabase-types/store";

export const getDeletes = (state: State) => state.admin.databases.deletes;

export const getDeletionError = (state: State) =>
  state.admin.databases.deletionError;
