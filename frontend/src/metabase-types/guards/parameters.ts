import type {
  Parameter,
  ParameterTarget,
  ParameterDimensionTarget,
} from "metabase-types/types/Parameter";
import type { FieldFilterUiParameter } from "metabase-lib/parameters/types";
import { FIELD_FILTER_PARAMETER_TYPES } from "metabase-lib/parameters/constants";

import { getParameterType } from "metabase-lib/parameters/utils/parameter-type";

export function isFieldFilterParameter(
  parameter: Parameter,
): parameter is FieldFilterUiParameter {
  const type = getParameterType(parameter);
  return FIELD_FILTER_PARAMETER_TYPES.includes(type);
}

export function isDimensionTarget(
  target: ParameterTarget,
): target is ParameterDimensionTarget {
  return target?.[0] === "dimension";
}
