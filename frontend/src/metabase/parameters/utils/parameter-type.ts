import _ from "underscore";
import { Parameter } from "metabase-types/types/Parameter";
import { FieldFilterUiParameter } from "metabase-lib/lib/parameters/types";
import { FIELD_FILTER_PARAMETER_TYPES } from "metabase-lib/lib/parameters/constants";
import { getParameterType } from "metabase-lib/lib/parameters/utils/parameter-type";

export function isFieldFilterParameter(
  parameter: Parameter,
): parameter is FieldFilterUiParameter {
  const type = getParameterType(parameter);
  return FIELD_FILTER_PARAMETER_TYPES.includes(type);
}
