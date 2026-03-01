import type { Revision, User } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getRevisions = (state: State): Revision[] | null =>
  state.admin.datamodel.revisions;

/**
 * @deprecated Use getUser from metabase/selectors/user.ts
 */
export const getCurrentUser = (state: State): User | null => state.currentUser;
