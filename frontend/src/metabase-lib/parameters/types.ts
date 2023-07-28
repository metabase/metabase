import type { Parameter, ParameterTarget } from "metabase-types/api";
import type Field from "metabase-lib/metadata/Field";

interface ValuePopulatedParameter extends ParameterWithTemplateTagTarget {
  value?: any;
}

export interface FieldFilterUiParameter extends ValuePopulatedParameter {
  fields: Field[];
}

export type UiParameter = (FieldFilterUiParameter | ValuePopulatedParameter) & {
  hidden?: boolean;
};

export interface ParameterWithTarget extends Parameter {
  target: ParameterTarget;
}

export interface ParameterWithTemplateTagTarget extends Parameter {
  hasVariableTemplateTagTarget?: boolean;
}
