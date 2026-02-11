import type { State } from "metabase-types/store";

export const getPreviewSummary = (state: State) =>
  state.admin.datamodel.previewSummary;
export const getRevisions = (state: State) => state.admin.datamodel.revisions;
export const getCurrentUser = (state: State) => state.currentUser;
