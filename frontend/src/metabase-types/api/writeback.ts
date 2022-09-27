import { Card, ActionFormSettings, ParameterId } from "metabase-types/api";
import { Parameter, ParameterTarget } from "metabase-types/types/Parameter";

export interface WritebackParameter extends Parameter {
  target: ParameterTarget;
}

export type WritebackActionType = "http" | "query";

export interface WritebackActionBase {
  id: number;
  name: string;
  description: string | null;
  parameters: WritebackParameter[];
  visualization_settings?: ActionFormSettings;
  "updated-at": string;
  "created-at": string;
}

export type QueryActionCard = Card & {
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

export type ParameterMappings = Record<ParameterId, ParameterTarget>;

type ParameterForActionExecutionBase = {
  type: string;
  value: string | number;
};

export type ParameterMappedForActionExecution =
  ParameterForActionExecutionBase & {
    id: ParameterId;
    target: ParameterTarget;
  };

export type ArbitraryParameterForActionExecution =
  ParameterForActionExecutionBase & {
    target: ParameterTarget;
  };

export interface ModelAction {
  id: number;
  action_id?: number; // empty for implicit actions
  name?: string; // empty for implicit actions
  card_id: number; // the card id of the model
  entity_id: string;
  requires_pk: boolean;
  slug: string;
  parameter_mappings?: ParameterMappings;
  visualization_settings?: ActionFormSettings;
}
