import type { State } from "metabase/redux/store";
import type { Revision } from "metabase-types/api";

export const getRevisions = (state: State): Revision[] | null =>
  state.admin.datamodel.revisions;
