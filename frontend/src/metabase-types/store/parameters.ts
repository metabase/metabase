import type { ParameterValues } from "metabase-types/api";

export type ParameterValuesCache = Record<string, ParameterValues>;

export interface ParametersState {
  parameterValuesCache: ParameterValuesCache;
}
