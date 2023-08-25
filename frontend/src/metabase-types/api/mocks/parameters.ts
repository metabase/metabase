import type { Parameter, ParameterValues } from "metabase-types/api";

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
