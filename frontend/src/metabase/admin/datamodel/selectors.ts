import type { Revision, User } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getPreviewSummary = (state: State): string | null =>
  state.admin.datamodel.previewSummary;

export const getRevisions = (state: State): Revision[] | null =>
  state.admin.datamodel.revisions;

export const getCurrentUser = (state: State): User | null => state.currentUser;
