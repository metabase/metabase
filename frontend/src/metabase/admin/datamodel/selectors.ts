import type { State } from "metabase-types/store";

export const getPreviewSummary = (state: State) =>
  state.admin.datamodel.previewSummary;
export const getRevisions = (state: State) => state.admin.datamodel.revisions;
// Non-null assertion: getCurrentUser is only used in authenticated contexts
export const getCurrentUser = (state: State) => state.currentUser!;
