import type { CardId } from "./card";
import type { DatabaseId } from "./database";
import type { Parameter, ParameterId, ParameterTarget } from "./parameters";
import type { NativeDatasetQuery } from "./query";
import type { UserId, UserInfo } from "./user";

export interface WritebackParameter extends Parameter {
  target: ParameterTarget;
}

export type WritebackActionType = "http" | "query" | "implicit";

export type WritebackActionId = number;

export interface WritebackActionBase {
  id: WritebackActionId;
  model_id: CardId;
  name: string;
  description: string | null;
  parameters: WritebackParameter[];
  visualization_settings?: ActionFormSettings;
  archived: boolean;
  creator_id: UserId;
  creator: UserInfo;
  updated_at: string;
  created_at: string;
  public_uuid: string | null;
  database_id?: DatabaseId;
  database_enabled_actions?: boolean;
}

export type PublicWritebackAction = Pick<
  WritebackActionBase,
  "id" | "name" | "parameters" | "visualization_settings" | "database_id"
>;

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
  error?: unknown;
}

export type OnSubmitActionForm = (
  parameters: ParametersForActionExecution,
) => Promise<ActionFormSubmitResult>;

// Action Forms

export type ActionDisplayType = "form" | "button";
export type FieldType = "string" | "number" | "date";

export type DateInputType = "date" | "time" | "datetime";

// these types are saved in visualization_settings
export type InputSettingType =
  | DateInputType
  | "string"
  | "text"
  | "number"
  | "select"
  | "radio"
  | "boolean";

// these types get passed to the input components
export type InputComponentType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "radio"
  | "date"
  | "time"
  | "datetime-local";

export type Size = "small" | "medium" | "large";

export type DateRange = [string, string];
export type NumberRange = [number, number];

export type FieldValueOptions = (string | number)[];

export interface FieldSettings {
  id: string;
  name: string;
  title: string;
  order: number;
  description?: string | null;
  placeholder?: string;
  fieldType: FieldType;
  inputType: InputSettingType;
  required: boolean;
  defaultValue?: string | number;
  hidden: boolean;
  range?: DateRange | NumberRange;
  valueOptions?: FieldValueOptions;
  width?: Size;
  height?: number;
  hasSearch?: boolean;
}

export type FieldSettingsMap = Record<ParameterId, FieldSettings>;
export interface ActionFormSettings {
  name?: string;
  type?: ActionDisplayType;
  description?: string;
  fields?: FieldSettingsMap;
  submitButtonLabel?: string;
  submitButtonColor?: string;
  confirmMessage?: string;
  successMessage?: string;
  errorMessage?: string;
}

export type ActionFormOption = {
  name: string | number;
  value: string | number;
};

export interface WritebackActionListQuery {
  "model-id"?: CardId;
}
