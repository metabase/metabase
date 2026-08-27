import { revisionApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import {
  combineReducers,
  createThunkAction,
  handleActions,
} from "metabase/redux";
import type { Revision, RevisionId } from "metabase-types/api";

export const FETCH_REVISIONS = "metabase/admin/datamodel/FETCH_REVISIONS";

export const fetchSegmentRevisions = createThunkAction(
  FETCH_REVISIONS,
  (id: RevisionId | string) => async (dispatch) =>
    runRtkEndpoint(
      { entity: "segment", id: Number(id) },
      dispatch,
      revisionApi.endpoints.listRevisions,
    ),
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
