import _ from "underscore";
import { FIELD_FILTER_PARAMETER_TYPES } from "metabase/parameters/constants";
import { FieldFilterUiParameter } from "metabase/parameters/types";
import { Parameter } from "metabase-types/types/Parameter";
import { getParameterType } from "metabase-lib/lib/parameters/utils/parameter-type";

export function isFieldFilterParameter(
  parameter: Parameter,
): parameter is FieldFilterUiParameter {
  const type = getParameterType(parameter);
  return FIELD_FILTER_PARAMETER_TYPES.includes(type);
}
