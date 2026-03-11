import type { Revision } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getRevisions = (state: State): Revision[] | null =>
  state.admin.datamodel.revisions;
