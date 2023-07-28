import type {
  Card,
  ParameterDimensionTarget,
  ParameterVariableTarget,
  ParameterTarget,
} from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";
import Dimension from "metabase-lib/Dimension";
import Metadata from "metabase-lib/metadata/Metadata";
import Question from "metabase-lib/Question";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import TemplateTagVariable from "metabase-lib/variables/TemplateTagVariable";

export function isVariableTarget(target: ParameterTarget) {
  return target?.[0] === "variable";
}

export function getTemplateTagFromTarget(target: ParameterTarget) {
  if (!target?.[1]) {
    return null;
  }

  const [, [type, tag]] = target;
  return type === "template-tag" ? tag : null;
}

export function getParameterTargetField(
  target: ParameterTarget,
  metadata: Metadata,
  question: Question,
) {
  if (isDimensionTarget(target)) {
    const query = question.query() as NativeQuery | StructuredQuery;
    const dimension = Dimension.parseMBQL(target[1], metadata, query);

    return dimension?.field();
  }

  return null;
}

export function buildDimensionTarget(dimension: Dimension) {
  return ["dimension", dimension.mbql()];
}

export function buildTemplateTagVariableTarget(variable: TemplateTagVariable) {
  return ["variable", variable.mbql()];
}

export function buildTextTagTarget(tagName: string) {
  return ["text-tag", tagName];
}

export function getTargetFieldFromCard(
  target: ParameterVariableTarget | ParameterDimensionTarget,
  card: Card,
  metadata: Metadata,
) {
  if (!card?.dataset_query) {
    return null;
  }

  const question = new Question(card, metadata);
  const field = getParameterTargetField(target, metadata, question);
  return field ?? null;
}
