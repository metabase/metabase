import {
  combineReducers,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import { RevisionsApi } from "metabase/services";
import type { Revision, RevisionId } from "metabase-types/api";

export const FETCH_REVISIONS = "metabase/admin/datamodel/FETCH_REVISIONS";

export const fetchSegmentRevisions = createThunkAction(
  FETCH_REVISIONS,
  (id: RevisionId | string) => async () =>
    RevisionsApi.get({ entity: "segment", id: Number(id) }),
);

const revisions = handleActions<Revision[] | null>(
  {
    [FETCH_REVISIONS]: {
      next: (
        _state: Revision[] | null,
        { payload }: { payload: Revision[] | null },
      ) => payload,
    },
  },
  null,
);

export const datamodel = combineReducers({ revisions });
