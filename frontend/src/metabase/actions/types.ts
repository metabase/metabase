import type Field from "metabase-lib/v1/metadata/Field";
import type {
  ActionFormOption,
  FieldSettings as BaseFieldSettings,
  InputComponentType,
} from "metabase-types/api";

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
