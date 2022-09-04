import { Card } from "metabase-types/api";
import {
  Parameter,
  ParameterId,
  ParameterTarget,
} from "metabase-types/types/Parameter";

export interface WritebackParameter extends Parameter {
  target: ParameterTarget;
}

export type WritebackActionType = "http" | "query";

export interface WritebackActionBase {
  id: number;
  name: string;
  description: string | null;
  parameters: WritebackParameter[];
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

export type ParametersMappedToValues = Record<
  ParameterId,
  { type: string; value: string | number }
>;

export type ParameterMappedForActionExecution = {
  id: ParameterId;
  type: string;
  value: string | number;
};

// we will tighten this up when we figure out what the form settings should look like
export type ActionFormSettings = {
  [key: string]: any;
};
