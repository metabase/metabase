import {
  WritebackQueryAction,
  WritebackImplicitQueryAction,
} from "metabase-types/api";
import { createMockNativeDatasetQuery } from "./query";

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
    "updated-at": new Date().toISOString(),
    "created-at": new Date().toISOString(),
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
  "updated-at": new Date().toISOString(),
  "created-at": new Date().toISOString(),
  parameters: [
    {
      id: "id",
      name: "ID",
      target: ["variable", ["template-tag", "id"]],
      type: "type/Integer",
      slug: "id",
    },
    {
      id: "name",
      target: ["variable", ["template-tag", "name"]],
      type: "type/Text",
      name: "Name",
      slug: "name",
    },
  ],
  visualization_settings: undefined,
  ...options,
  type: "implicit",
});
