import { Parameter } from "metabase-types/api";

export const createMockParameter = (opts?: Partial<Parameter>): Parameter => ({
  id: "1",
  name: "text",
  type: "string/=",
  slug: "text",
  values_query_type: "none",
  values_source_type: null,
  values_source_config: {},
  ...opts,
});
