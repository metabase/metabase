import type {
  ParameterDimensionTarget,
  ParameterTarget,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";

export function isDimensionTarget(
  target: ParameterTarget | undefined,
): target is ParameterDimensionTarget {
  return target?.[0] === "dimension";
}

export function isStructuredDimensionTarget(
  target: ParameterTarget | undefined,
): target is StructuredParameterDimensionTarget {
  return isDimensionTarget(target) && target[1][0] !== "template-tag";
}
