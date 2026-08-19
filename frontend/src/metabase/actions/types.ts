import type Field from "metabase-lib/v1/metadata/Field";
import type {
  ActionFormOption,
  FieldSettings as BaseFieldSettings,
  InputComponentType,
  WritebackAction,
  WritebackImplicitQueryAction,
  WritebackQueryAction,
} from "metabase-types/api";

// A fetched action always carries a description; creating one need not send it.
type BaseCreateActionParams = Pick<
  WritebackAction,
  "name" | "model_id" | "parameters" | "visualization_settings"
> &
  Partial<Pick<WritebackAction, "description">>;

type BaseUpdateActionParams = {
  id: WritebackAction["id"];
};

export type CreateQueryActionParams = BaseCreateActionParams &
  Pick<WritebackQueryAction, "type" | "dataset_query" | "database_id">;

export type UpdateQueryActionParams = Partial<CreateQueryActionParams> &
  BaseUpdateActionParams;

export type CreateImplicitActionParams = BaseCreateActionParams &
  Pick<WritebackImplicitQueryAction, "type" | "kind">;

export type UpdateImplicitActionParams = Omit<
  Partial<CreateImplicitActionParams>,
  "type"
> &
  BaseUpdateActionParams;

export type CreateActionParams =
  | CreateQueryActionParams
  | CreateImplicitActionParams;

export type UpdateActionParams =
  | UpdateQueryActionParams
  | UpdateImplicitActionParams;

export type FieldSettings = BaseFieldSettings & {
  field?: Field;
};

export type ActionFormFieldProps = {
  name: string;
  title: string;
  description?: string;
  placeholder?: string;
  type: InputComponentType;
  optional?: boolean;
  options?: ActionFormOption[];
  field?: Field;
};

export type ActionFormProps = {
  fields: ActionFormFieldProps[];
};
