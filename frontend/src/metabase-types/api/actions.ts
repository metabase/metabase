import {
  ActionFormSettings,
  NativeDatasetQuery,
  ParameterId,
} from "metabase-types/api";
import { Parameter, ParameterTarget } from "metabase-types/types/Parameter";

export interface WritebackParameter extends Parameter {
  target: ParameterTarget;
}

export type WritebackActionType = "http" | "query" | "implicit";

export interface WritebackActionBase {
  id?: number;
  model_id: number;
  name: string;
  description: string | null;
  parameters: WritebackParameter[];
  visualization_settings?: ActionFormSettings;
  "updated-at": string;
  "created-at": string;
}

export interface QueryAction {
  type: "query";
  dataset_query: NativeDatasetQuery;
}

export interface ImplicitQueryAction {
  type: "implicit";
  kind: "row/create" | "row/update" | "row/delete";
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
export type WritebackImplicitQueryAction = WritebackActionBase &
  ImplicitQueryAction;
export type WritebackHttpAction = WritebackActionBase & HttpAction;
export type WritebackAction = WritebackActionBase &
  (QueryAction | ImplicitQueryAction | HttpAction);

export type ParameterMappings = Record<ParameterId, ParameterTarget>;

export type ParametersForActionExecution = {
  [id: ParameterId]: string | number | null;
};

export type ActionFormInitialValues = ParametersForActionExecution;

export interface ActionFormSubmitResult {
  success: boolean;
  message?: string;
  error?: string;
}

export type OnSubmitActionForm = (
  parameters: ParametersForActionExecution,
) => Promise<ActionFormSubmitResult>;
