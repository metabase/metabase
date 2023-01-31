import { ParameterValuesResponse } from "metabase-types/api";

export type ParameterValuesCache = Record<string, ParameterValuesResponse>;

export interface ParametersState {
  valuesCache: ParameterValuesCache;
}
