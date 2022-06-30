import Field from "metabase-lib/lib/metadata/Field";
import { SavedCard, NativeDatasetQuery } from "metabase-types/types/Card";
import { ParameterId, ParameterTarget } from "metabase-types/types/Parameter";

export interface CategoryWidgetProps {
  field: {
    value: string;
    onChange: (value: string) => void;
  };
  formField: {
    fieldInstance: Field;
  };
}

export type WritebackActionCard = SavedCard<NativeDatasetQuery> & {
  is_write: true;
};

export interface WritebackAction {
  id: number;
  type: "row";
  card: WritebackActionCard;
  card_id: number;
  "updated-at": string;
  "created-at": string;
}

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

export type ActionType = "http";

export type ResponseHandler = {};
export type ErrorHandler = {};
export type Parameters = {};
export type ParameterMapping = {};

export type CreateActionData<T extends ActionType> = T extends "http"
  ? CreateHttpActionData
  : never;

export type CreateHttpActionData = {
  template: {
    method: string;
    url: string;
    body: string;
    headers: string;
    parameters: Parameters;
    parameter_mappings: ParameterMapping;
  };
  response_handle: ResponseHandler;
  error_handle: ErrorHandler;
};

export type CreateAction<T extends ActionType> = {
  type: T;
  name: string;
  description: string;
} & CreateActionData<T>;

export type SaveAction<T extends ActionType = ActionType> = (
  data: Omit<CreateAction<T>, "name" | "type" | "description">,
) => void;
