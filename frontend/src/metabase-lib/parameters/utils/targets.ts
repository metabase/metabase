import * as Lib from "metabase-lib";
import type { TemplateTagDimension } from "metabase-lib/Dimension";
import Dimension from "metabase-lib/Dimension";
import type Question from "metabase-lib/Question";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type TemplateTagVariable from "metabase-lib/variables/TemplateTagVariable";
import type {
  ConcreteFieldReference,
  FieldReference,
  NativeParameterDimensionTarget,
  ParameterTarget,
  ParameterTextTarget,
  ParameterVariableTarget,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";

export function isParameterVariableTarget(
  target: ParameterTarget,
): target is ParameterVariableTarget {
  return target[0] === "variable";
}

function isConcreteFieldReference(
  reference: FieldReference,
): reference is ConcreteFieldReference {
  return reference[0] === "field" || reference[0] === "expression";
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

    const field = dimension?.field();
    if (typeof field?.id === "number") {
      return field;
    }
  }

  return null;
}

export function buildDimensionTarget(
  dimension: TemplateTagDimension,
): NativeParameterDimensionTarget {
  return ["dimension", dimension.mbql()];
}

export function buildColumnTarget(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): StructuredParameterDimensionTarget {
  const fieldRef = Lib.legacyRef(query, stageIndex, column);

  if (!isConcreteFieldReference(fieldRef)) {
    throw new Error(`Cannot build column target field reference: ${fieldRef}`);
  }

  return ["dimension", fieldRef];
}

export function buildTemplateTagVariableTarget(
  variable: TemplateTagVariable,
): ParameterVariableTarget {
  return ["variable", variable.mbql()];
}

export function buildTextTagTarget(tagName: string): ParameterTextTarget {
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
