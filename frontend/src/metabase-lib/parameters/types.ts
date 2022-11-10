import type {
  Parameter,
  ParameterTarget,
} from "metabase-types/types/Parameter";
import type Field from "metabase-lib/metadata/Field";

export interface ValuePopulatedParameter extends Parameter {
  value?: any;
}

export interface FieldFilterUiParameter extends ValuePopulatedParameter {
  fields: Field[];
  hasVariableTemplateTagTarget?: boolean;
}

export type UiParameter = (FieldFilterUiParameter | ValuePopulatedParameter) & {
  hidden?: boolean;
};

export type ParameterWithTarget = Parameter & {
  target: ParameterTarget;
};
