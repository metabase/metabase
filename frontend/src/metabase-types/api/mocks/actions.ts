import type {
  CardId,
  PublicWritebackAction,
  WritebackParameter,
  WritebackQueryAction,
  WritebackImplicitQueryAction,
  ActionFormSettings,
  FieldSettings,
} from "metabase-types/api";

import { createMockParameter } from "./parameters";
import { createMockNativeDatasetQuery } from "./query";
import { createMockUserInfo } from "./user";

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
  creator = createMockUserInfo(),
  ...opts
}: Partial<WritebackQueryAction> = {}): WritebackQueryAction => {
  return {
    id: 1,
    dataset_query,
    name: "Query Action Mock",
    description: null,
    model_id: 1,
    database_id: 1,
    parameters: [],
    creator_id: creator.id,
    creator,
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    visualization_settings: { fields: {} },
    database_enabled_actions: true,
    public_uuid: null,
    ...opts,
    type: "query",
  };
};

export const createMockImplicitQueryAction = ({
  creator = createMockUserInfo(),
  ...opts
}: Partial<WritebackImplicitQueryAction> = {}): WritebackImplicitQueryAction => ({
  id: 1,
  kind: "row/create",
  name: "Create",
  description: "",
  model_id: 1,
  database_id: 1,
  parameters: [],
  visualization_settings: undefined,
  creator_id: creator.id,
  creator,
  archived: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  database_enabled_actions: true,
  public_uuid: null,
  ...opts,
  type: "implicit",
});

export const createMockImplicitCUDActions = (
  modelId: CardId,
  startId: number = 0,
): WritebackImplicitQueryAction[] => [
  createMockImplicitQueryAction({
    id: startId + 1,
    name: "Create",
    kind: "row/create",
    model_id: modelId,
  }),
  createMockImplicitQueryAction({
    id: startId + 2,
    name: "Update",
    kind: "row/update",
    model_id: modelId,
  }),
  createMockImplicitQueryAction({
    id: startId + 3,
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
  database_id: 1,
  parameters: [],
  ...opts,
});

export const createMockActionFormSettings = (
  opts?: Partial<ActionFormSettings>,
): ActionFormSettings => ({ ...opts });

export const createMockFieldSettings = (
  opts?: Partial<FieldSettings>,
): FieldSettings => ({
  id: "",
  name: "",
  title: "",
  description: "",
  placeholder: "",
  order: 0,
  fieldType: "string",
  inputType: "string",
  required: true,
  hidden: false,
  width: "medium",
  ...opts,
});

export const createMockImplicitActionFieldSettings = (
  opts?: Partial<FieldSettings>,
) =>
  ({
    id: "",
    hidden: false,
    ...opts,
  } as FieldSettings);
