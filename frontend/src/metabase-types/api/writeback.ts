import { SavedCard, NativeDatasetQuery } from "metabase-types/types/Card";
import { DashboardWithCards } from "metabase-types/types/Dashboard";
import { Column } from "metabase-types/types/Dataset";
import {
  Parameter,
  ParameterId,
  ParameterTarget,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";

export type ActionParameterTuple = [string, Parameter];

export type WritebackActionType = "http" | "query";

export interface WritebackActionBase {
  id: number;
  name: string;
  description: string | null;
  parameters: ActionParameterTuple[];
  "updated-at": string;
  "created-at": string;
}

type QueryActionCard = SavedCard<NativeDatasetQuery> & {
  is_write: true;
  action_id: number;
};

export interface QueryAction {
  type: "query";
  card: QueryActionCard;
  card_id: number;
}

export interface HttpAction {
  type: "http";
  template: HttpActionTemplate;
  response_handle: string | null;
  error_handle: string | null;
}

export type HttpActionResponseHandle = any;
export type HttpActionErrorHandle = any;

export interface HttpActionTemplate {
  method: string;
  url: string;
  body: string;
  headers: string;
  parameters: Record<ParameterId, Parameter>;
  parameter_mappings: Record<ParameterId, ParameterTarget>;
}

export type WritebackQueryAction = WritebackActionBase & QueryAction;
export type WritebackHttpAction = WritebackActionBase & HttpAction;
export type WritebackAction = WritebackActionBase & (QueryAction | HttpAction);

export interface WritebackActionEmitter {
  id: number;
  dashboard_id: number;
  action: WritebackAction & {
    emitter_id: number;
  };
  parameter_mappings: Record<ParameterId, ParameterTarget>;
  updated_at: string;
  created_at: string;
}

export type ParameterMappings = Record<ParameterId, ParameterTarget>;

export type ActionClickBehaviorData = {
  column: Partial<Column>;
  parameter: Record<ParameterId, { value: ParameterValueOrArray }>;
  parameterByName: Record<string, { value: ParameterValueOrArray }>;
  parameterBySlug: Record<string, { value: ParameterValueOrArray }>;
  userAttributes: Record<string, unknown>;
};

export type ActionClickBehavior = {
  action: number; // action id
  emitter_id: number;
  type: "action";
  parameterMapping: ParameterMappings;
};

export type ActionClickExtraData = {
  actions: Record<number, WritebackAction>;
  dashboard: DashboardWithCards;
  parameterBySlug: Record<string, { value: ParameterValueOrArray }>;
  userAttributes: unknown[];
};

export type ParametersSourceTargetMap = Record<
  ParameterId,
  {
    id: ParameterId;
    source: { id: string; type: string; name: string };
    target: { id: string; type: string };
  }
>;

export type ParametersMappedToValues = Record<
  ParameterId,
  { type: string; value: string | number }
>;
