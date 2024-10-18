import type {
  ParameterDimensionTarget,
  ParameterTarget,
} from "metabase-types/api";

export function isDimensionTarget(
  target: ParameterTarget | undefined,
): target is ParameterDimensionTarget {
  return target?.[0] === "dimension";
}
