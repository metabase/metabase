import Field from "metabase-lib/lib/metadata/Field";
import { Parameter, ParameterTarget } from "metabase-types/types/Parameter";

export interface ValuePopulatedParameter extends Parameter {
  value?: any;
}

export interface FieldFilterUiParameter extends ValuePopulatedParameter {
  fields: Field[];
  hasOnlyFieldTargets?: boolean;
}

export type UiParameter = FieldFilterUiParameter | ValuePopulatedParameter;

export type ParameterWithTarget = Parameter & {
  target: ParameterTarget;
};
