import Dimension from "metabase-lib/lib/Dimension";

export function isDimensionTarget(target) {
  return target?.[0] === "dimension";
}

export function getParameterTargetField(target, metadata, question) {
  if (isDimensionTarget(target)) {
    const dimension = Dimension.parseMBQL(
      target[1],
      metadata,
      question.query(),
    );

    return dimension?.field();
  }

  return null;
}
