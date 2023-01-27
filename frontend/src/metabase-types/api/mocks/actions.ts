import {
  CardId,
  PublicWritebackAction,
  WritebackParameter,
  WritebackQueryAction,
  WritebackImplicitQueryAction,
} from "metabase-types/api";
import { createMockNativeDatasetQuery } from "./query";
import { createMockParameter } from "./parameters";

export const createMockActionParameter = ({
  id = "id",
  target = ["variable", ["template-tag", id]],
  ...opts
}: Partial<WritebackParameter> = {}): WritebackParameter => {
  const parameter = createMockParameter({
    id,
    name: "ID",
    type: "type/Integer",
    slug: "id",
    ...opts,
  });
  return { ...parameter, target };
};

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
    public_uuid: null,
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
  public_uuid: null,
  ...options,
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

export const createMockPublicAction = (
  opts?: Partial<PublicWritebackAction>,
): PublicWritebackAction => ({
  id: 1,
  name: "Public Action",
  parameters: [],
  ...opts,
});
