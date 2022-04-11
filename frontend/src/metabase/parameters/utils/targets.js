import Dimension from "metabase-lib/lib/Dimension";

export function isDimensionTarget(target) {
  return target?.[0] === "dimension";
}

export function isVariableTarget(target) {
  return target?.[0] === "variable";
}

export function getTemplateTagFromTarget(target) {
  if (!target?.[1]) {
    return null;
  }

  const [, [type, tag]] = target;
  return type === "template-tag" ? tag : null;
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
