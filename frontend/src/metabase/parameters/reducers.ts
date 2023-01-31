import { handleActions } from "redux-actions";
import Questions from "metabase/entities/questions";
import { ParameterValuesCache } from "metabase-types/store/parameters";
import { FETCH_PARAMETER_VALUES, FetchParameterValuesPayload } from "./actions";

export const valuesCache = handleActions<
  ParameterValuesCache,
  FetchParameterValuesPayload
>(
  {
    [FETCH_PARAMETER_VALUES]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.requestKey]: payload.response,
      }),
    },
    [Questions.actionTypes.UPDATE]: { next: () => ({}) },
  },
  {},
);
