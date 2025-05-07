import type {
  Parameter,
  ParameterValues,
  SearchParameterValuesRequest,
} from "metabase-types/api";

export const createMockParameter = (opts?: Partial<Parameter>): Parameter => ({
  id: "1",
  name: "text",
  type: "string/=",
  slug: "text",
  ...opts,
});

export const createMockParameterValues = (
  opts?: Partial<ParameterValues>,
): ParameterValues => ({
  values: [],
  has_more_values: false,
  ...opts,
});

export const createMockSearchParameterValuesRequest = (
  opts?: Partial<SearchParameterValuesRequest>,
): SearchParameterValuesRequest => ({
  parameter: createMockParameter(),
  field_ids: [],
  query: "",
  ...opts,
});
