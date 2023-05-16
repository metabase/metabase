import type {
  ActionFormOption,
  FieldSettings as BaseFieldSettings,
  InputComponentType,
} from "metabase-types/api";
import type Field from "metabase-lib/metadata/Field";

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
