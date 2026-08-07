import { createAction } from "redux-actions";

import { SET_CURRENT_STATE } from "metabase/redux/query-builder";

export const setCurrentState = createAction(SET_CURRENT_STATE);
