import type { State } from "metabase/redux/store";

export const getParameterValuesCache = (state: State) => {
  return state.parameters.parameterValuesCache;
};
