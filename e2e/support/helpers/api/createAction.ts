import type {
  ActionFormSettings,
  CardId,
  CollectionId,
  ImplicitActionKind,
  ParameterId,
  ParameterTarget,
  TableId,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

type BaseCreateActionOpts = {
  name?: string;
  description?: string | null;
  collection_id?: CollectionId | null;
  model_id?: CardId | null;
  parameters?: WritebackParameter[];
  parameter_mappings?: Record<ParameterId, ParameterTarget>;
  visualization_settings?: ActionFormSettings;
};

type CreateQueryActionOpts = BaseCreateActionOpts & {
  type: "query";
  // e2e tests still pass hand-written legacy MBQL; migrate them to the Lib test spec and drop `any`
  dataset_query: any;
};

type CreateImplicitActionOpts = BaseCreateActionOpts & {
  type: "implicit";
  kind: ImplicitActionKind;
  table_id?: TableId;
};

export type CreateActionOpts = CreateQueryActionOpts | CreateImplicitActionOpts;

const DEFAULT_ACTION_NAME = "Action";

export function createAction(
  opts: CreateActionOpts,
): Cypress.Chainable<WritebackAction> {
  return cy
    .request<WritebackAction>("POST", "/api/action", {
      name: DEFAULT_ACTION_NAME,
      ...opts,
    })
    .then(({ body }) => body);
}
