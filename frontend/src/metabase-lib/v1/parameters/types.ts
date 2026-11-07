import type {
  Parameter,
  ParameterField,
  ParameterTarget,
  ParameterValueOrArray,
} from "metabase-types/api";

interface ValuePopulatedParameter extends ParameterWithTemplateTagTarget {
  value?: ParameterValueOrArray | null;
}

export interface FieldFilterUiParameter extends ValuePopulatedParameter {
  fields: ParameterField[];
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
