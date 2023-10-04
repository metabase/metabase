import type {
  ParameterDimensionTarget,
  ParameterTarget,
} from "metabase-types/api";

export function isDimensionTarget(
  target: ParameterTarget,
): target is ParameterDimensionTarget {
  return target?.[0] === "dimension";
}
