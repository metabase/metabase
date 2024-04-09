import type { State } from "metabase-types/store";

export const getParameterValuesCache = (state: State) => {
  return state.parameters.parameterValuesCache;
};
