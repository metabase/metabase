import type { ParametersState } from "metabase/redux/store/parameters";

export const createMockParametersState = (
  opts?: Partial<ParametersState>,
): ParametersState => ({
  parameterValuesCache: {},
  ...opts,
});
