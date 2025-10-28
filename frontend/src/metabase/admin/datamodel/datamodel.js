import {
  combineReducers,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import { RevisionsApi } from "metabase/services";

// REVISION HISTORY
export const FETCH_REVISIONS = "metabase/admin/datamodel/FETCH_REVISIONS";

export const fetchSegmentRevisions = createThunkAction(
  FETCH_REVISIONS,
  (id) => async () => RevisionsApi.get({ entity: "segment", id }),
);

// reducers
const revisions = handleActions(
  { [FETCH_REVISIONS]: { next: (state, { payload }) => payload } },
  null,
);

export default combineReducers({ revisions });
