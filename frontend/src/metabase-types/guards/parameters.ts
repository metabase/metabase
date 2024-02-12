import type {
  ParameterDimensionTarget,
  ParameterTarget,
} from "metabase-types/api";
import type {
  ParameterMappingOptions,
  StructuredQuerySectionOptions,
} from "metabase/parameters/utils/mapping-options";

export function isDimensionTarget(
  target: ParameterTarget,
): target is ParameterDimensionTarget {
  return target?.[0] === "dimension";
}

export function isStructuredQuerySectionOption(
  option: ParameterMappingOptions,
): option is StructuredQuerySectionOptions {
  return option.target[1] === "field";
}
