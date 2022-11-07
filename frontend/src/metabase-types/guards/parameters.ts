import type {
  ParameterTarget,
  ParameterDimensionTarget,
} from "metabase-types/types/Parameter";

export function isDimensionTarget(
  target: ParameterTarget,
): target is ParameterDimensionTarget {
  return target?.[0] === "dimension";
}
