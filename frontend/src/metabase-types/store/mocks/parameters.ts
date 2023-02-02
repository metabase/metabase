import { ParametersState } from "metabase-types/store/parameters";

export const createMockParametersState = (
  opts?: Partial<ParametersState>,
): ParametersState => ({
  parameterValuesCache: {},
  ...opts,
});
