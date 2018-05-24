import { FETCH_REVISIONS } from "./metadata";

import { assocIn } from "icepick";
import _ from "underscore";

// NOTE: actions are still in metabase/redux/metadata

export default (state = {}, action) => {
  if (action.type === FETCH_REVISIONS && !action.error) {
    const { type, id, revisions } = action.payload;
    return assocIn(state, [type, id], _.indexBy(revisions, "id"));
  } else {
    return state;
  }
};
