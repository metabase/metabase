import type { CardId } from "./card";
import type { CollectionId } from "./collection";
import type { DashCardId, DashboardId } from "./dashboard";
import type { DatabaseId } from "./database";
import type { BaseEntityId } from "./entity-id";
import type { Parameter, ParameterId, ParameterTarget } from "./parameters";
import type { NativeDatasetQuery, OpaqueDatasetQuery } from "./query";
import type { UserId, UserInfo } from "./user";

export type ListActionsRequest = {
  "model-id"?: CardId;
  type?: WritebackActionType;
};

export interface CreateActionRequest {
  collection_id?: CollectionId | null;
  database_id?: DatabaseId;
  dataset_query?: NativeDatasetQuery | OpaqueDatasetQuery;
  description?: string | null;
  kind?: "row/create" | "row/update" | "row/delete";
  model_id?: CardId | null;
  name: string;
  parameter_mappings?: Record<ParameterId, ParameterTarget>;
  parameters?: WritebackParameter[];
  type?: "query" | "implicit";
  visualization_settings?: ActionFormSettings;
}

export interface UpdateActionRequest {
  id: WritebackActionId;
  archived?: boolean;
  collection_id?: CollectionId | null;
  database_id?: DatabaseId;
  dataset_query?: NativeDatasetQuery | OpaqueDatasetQuery;
  description?: string | null;
  kind?: "row/create" | "row/update" | "row/delete";
  model_id?: CardId;
  name?: string;
  parameter_mappings?: Record<ParameterId, ParameterTarget>;
  parameters?: WritebackParameter[];
  visualization_settings?: ActionFormSettings;
}

export interface WritebackParameter extends Parameter {
  target: ParameterTarget;
}

export type WritebackActionType = "query" | "implicit";

export type WritebackActionId = number;

export interface WritebackActionBase {
  id: WritebackActionId;
  model_id: CardId | null;
  collection_id: CollectionId | null;
  name: string;
  description: string | null;
  parameters?: WritebackParameter[];
  visualization_settings?: ActionFormSettings;
  archived: boolean;
  creator_id: UserId;
  creator: UserInfo;
  updated_at: string;
  created_at: string;
  public_uuid: string | null;
  database_id?: DatabaseId;
  database_enabled_actions?: boolean;
  can_write?: boolean;
  entity_id: BaseEntityId;
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

export type WritebackQueryAction = WritebackActionBase & QueryAction;
export type WritebackImplicitQueryAction = WritebackActionBase &
  ImplicitQueryAction;
export type WritebackAction = WritebackActionBase &
  (QueryAction | ImplicitQueryAction);

export type ParameterMappings = Record<ParameterId, ParameterTarget>;

export type ParametersForActionExecution = {
  [id: ParameterId]: string | number | boolean | null;
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
  defaultValue?: string | number | null;
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

export interface GetActionRequest {
  id: number;
}

export interface ExecuteActionRequest {
  id: WritebackActionId | BaseEntityId;
  parameters: ParametersForActionExecution;
}

export interface PrefetchActionValuesRequest {
  id: WritebackActionId;
  parameters: ParametersForActionExecution;
}

export interface ExecuteDashcardActionRequest {
  dashboardId: DashboardId;
  dashcardId: DashCardId;
  modelId?: CardId | null;
  parameters: ParametersForActionExecution;
}

export interface PrefetchDashcardValuesRequest {
  dashboardId: DashboardId;
  dashcardId: DashCardId;
  parameters: ParametersForActionExecution;
}

export interface PrefetchPublicDashcardValuesRequest {
  dashboardId: DashboardId;
  dashcardId: DashCardId;
  parameters: ParametersForActionExecution;
}

export type ActionExecutionResult = Record<string, unknown>;
export type GetPublicAction = Pick<
  WritebackActionBase,
  "id" | "name" | "public_uuid" | "model_id"
>;
