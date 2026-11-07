import type {
  Parameter,
  ParameterFieldInfo,
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

export const createMockParameterFieldInfo = (
  opts?: Partial<ParameterFieldInfo>,
): ParameterFieldInfo => ({
  id: 1,
  name: "FIELD",
  display_name: "Field",
  base_type: "type/Text",
  effective_type: null,
  semantic_type: null,
  settings: null,
  has_field_values: "list",
  has_remapping: false,
  ...opts,
});
