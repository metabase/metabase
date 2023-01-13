import {
  WritebackParameter,
  WritebackQueryAction,
  WritebackImplicitQueryAction,
} from "metabase-types/api";
import { createMockNativeDatasetQuery } from "./query";
import { createMockParameter } from "./parameters";

export const createMockActionParameter = (
  opts?: Partial<WritebackParameter>,
): WritebackParameter => ({
  target: opts?.target || ["variable", ["template-tag", "id"]],
  ...createMockParameter({
    id: "id",
    name: "ID",
    type: "type/Integer",
    slug: "id",
    ...opts,
  }),
});

export const createMockQueryAction = ({
  dataset_query = createMockNativeDatasetQuery(),
  ...opts
}: Partial<WritebackQueryAction> = {}): WritebackQueryAction => {
  return {
    id: 1,
    dataset_query,
    name: "Query Action Mock",
    description: null,
    model_id: 1,
    parameters: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...opts,
    type: "query",
  };
};

export const createMockImplicitQueryAction = (
  options: Partial<WritebackImplicitQueryAction>,
): WritebackImplicitQueryAction => ({
  id: 1,
  kind: "row/create",
  name: "",
  description: "",
  model_id: 1,
  parameters: [],
  visualization_settings: undefined,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...options,
  type: "implicit",
});
