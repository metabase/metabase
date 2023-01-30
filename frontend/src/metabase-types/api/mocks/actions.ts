import {
  CardId,
  WritebackParameter,
  WritebackQueryAction,
  WritebackImplicitQueryAction,
} from "metabase-types/api";
import { createMockNativeDatasetQuery } from "./query";
import { createMockParameter } from "./parameters";
import { createMockUserInfo } from "./user";

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
  creator = createMockUserInfo(),
  ...opts
}: Partial<WritebackQueryAction> = {}): WritebackQueryAction => {
  return {
    id: 1,
    dataset_query,
    name: "Query Action Mock",
    description: null,
    model_id: 1,
    parameters: [],
    creator_id: creator.id,
    creator,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...opts,
    type: "query",
  };
};

export const createMockImplicitQueryAction = ({
  creator = createMockUserInfo(),
  ...opts
}: Partial<WritebackImplicitQueryAction>): WritebackImplicitQueryAction => ({
  id: 1,
  kind: "row/create",
  name: "",
  description: "",
  model_id: 1,
  parameters: [],
  visualization_settings: undefined,
  creator_id: creator.id,
  creator,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...opts,
  type: "implicit",
});

export const createMockImplicitCUDActions = (
  modelId: CardId,
): WritebackImplicitQueryAction[] => [
  createMockImplicitQueryAction({
    id: 1,
    name: "Create",
    kind: "row/create",
    model_id: modelId,
  }),
  createMockImplicitQueryAction({
    id: 2,
    name: "Update",
    kind: "row/update",
    model_id: modelId,
  }),
  createMockImplicitQueryAction({
    id: 3,
    name: "Delete",
    kind: "row/delete",
    model_id: modelId,
  }),
];
