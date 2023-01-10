import { Parameter } from "metabase-types/api";

export const createMockParameter = (opts?: Partial<Parameter>): Parameter => ({
  id: "1",
  name: "text",
  type: "string/=",
  slug: "text",
  ...opts,
});
