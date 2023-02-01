import { ParameterValues } from "metabase-types/api";

export type ParameterValuesCache = Record<string, ParameterValues>;

export interface ParametersState {
  valuesCache: ParameterValuesCache;
}
