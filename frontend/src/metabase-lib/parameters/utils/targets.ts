import type { ParameterTarget } from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";
import * as Lib from "metabase-lib";
import Dimension from "metabase-lib/Dimension";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type TemplateTagVariable from "metabase-lib/variables/TemplateTagVariable";

export function isVariableTarget(target: ParameterTarget) {
  return target?.[0] === "variable";
}

export function getTemplateTagFromTarget(target: ParameterTarget) {
  if (!target?.[1] || target?.[0] === "text-tag") {
    return null;
  }

  const [, [type, tag]] = target;
  return type === "template-tag" ? tag : null;
}

export function getParameterTargetField(
  target: ParameterTarget,
  question: Question,
) {
  if (isDimensionTarget(target)) {
    const query = question.legacyQuery({ useStructuredQuery: true }) as
      | NativeQuery
      | StructuredQuery;
    const metadata = question.metadata();
    const dimension = Dimension.parseMBQL(target[1], metadata, query);

    return dimension?.field();
  }

  return null;
}

export function buildDimensionTarget(dimension: Dimension) {
  return ["dimension", dimension.mbql()];
}

export function buildColumnTarget(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return ["dimension", Lib.legacyRef(query, stageIndex, column)];
}

export function buildTemplateTagVariableTarget(variable: TemplateTagVariable) {
  return ["variable", variable.mbql()];
}

export function buildTextTagTarget(tagName: string): ["text-tag", string] {
  return ["text-tag", tagName];
}

export function compareMappingOptionTargets(
  target1: ParameterTarget,
  target2: ParameterTarget,
  question1: Question,
  question2: Question,
) {
  if (!isDimensionTarget(target1) || !isDimensionTarget(target2)) {
    return false;
  }

  const fieldReference1 = getParameterTargetField(target1, question1);
  const fieldReference2 = getParameterTargetField(target2, question2);

  return fieldReference1?.id === fieldReference2?.id;
}
