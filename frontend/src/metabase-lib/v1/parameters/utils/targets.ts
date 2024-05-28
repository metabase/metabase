import * as Lib from "metabase-lib";
import { TemplateTagDimension } from "metabase-lib/v1/Dimension";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { isTemplateTagReference } from "metabase-lib/v1/references";
import type TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
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
  if (!isDimensionTarget(target)) {
    return null;
  }

  const fieldRef = target[1];
  const query = question.query();
  const metadata = question.metadata();

  // native queries
  if (isTemplateTagReference(fieldRef)) {
    const dimension = TemplateTagDimension.parseMBQL(
      fieldRef,
      metadata,
      question.legacyQuery() as NativeQuery,
    );
    return dimension?.field();
  }

  if (isConcreteFieldReference(fieldRef)) {
    const stageIndex = -1;
    const columns = Lib.visibleColumns(query, stageIndex);

    // query and metadata is not available - embedding
    if (columns.length === 0) {
      const [_, fieldId] = fieldRef;
      return metadata.field(fieldId);
    }

    const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      columns,
      [fieldRef],
    );
    if (columnIndex < 0) {
      return null;
    }

    const column = columns[columnIndex];
    const fieldValuesInfo = Lib.fieldValuesSearchInfo(query, column);
    if (fieldValuesInfo.fieldId == null) {
      return null;
    }

    return metadata.field(fieldValuesInfo.fieldId);
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
