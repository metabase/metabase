import Field from "metabase-lib/lib/metadata/Field";
import { SavedCard, NativeDatasetQuery } from "metabase-types/types/Card";
import {
  Parameter,
  ParameterId,
  ParameterTarget,
} from "metabase-types/types/Parameter";

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

export interface WritebackActionBase {
  id: number;
  "updated-at": string;
  "created-at": string;
}

export interface RowAction {
  type: "query";
  card: WritebackActionCard;
  card_id: number;
}

export interface HttpAction {
  type: "http";
  name: string;
  description: string;
  template: HttpActionTemplate;
  parameters: Record<ParameterId, Parameter>;
  parameter_mappings: Record<ParameterId, ParameterTarget>;
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

export type WritebackAction = WritebackActionBase & (RowAction | HttpAction);

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

export type ActionType = "http" | "query";
