import type { Parameter, ParameterTarget } from "metabase-types/api";
import type Field from "metabase-lib/metadata/Field";

interface ValuePopulatedParameter extends ParameterWithTemplateTagTarget {
  value?: any;
}

export interface UiParameterWithFields extends ValuePopulatedParameter {
  fields: [Field, ...Field[]];
}

export type UiParameter = (
  | UiParameterWithFields
  | ValuePopulatedParameter
  | Parameter
) & {
  hidden?: boolean;
};

export type FieldFilterUiParameter =
  | UiParameterWithFields
  | ValuePopulatedParameter;

export interface ParameterWithTarget extends Parameter {
  target: ParameterTarget;
}

export interface ParameterWithTemplateTagTarget extends Parameter {
  hasVariableTemplateTagTarget?: boolean;
}
