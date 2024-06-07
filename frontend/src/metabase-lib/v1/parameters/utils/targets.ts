import * as Lib from "metabase-lib";
import { TemplateTagDimension } from "metabase-lib/v1/Dimension";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import { isTemplateTagReference } from "metabase-lib/v1/references";
import type TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
import type {
  ConcreteFieldReference,
  FieldReference,
  NativeParameterDimensionTarget,
  Parameter,
  ParameterTarget,
  ParameterTextTarget,
  ParameterVariableTarget,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";

import { columnFilterForParameter } from "./filters";
import { isTemporalUnitParameter } from "./parameter-type";

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

// returns only real DB fields and not all mapped columns
// for columns, use getMappingOptionByTarget
export function getParameterTargetField(
  question: Question,
  parameter: Parameter,
  target: ParameterTarget,
) {
  if (!isDimensionTarget(target)) {
    return null;
  }

  const fieldRef = target[1];
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
    const [_, fieldIdOrName] = fieldRef;
    const fields = metadata.fieldsList();
    if (typeof fieldIdOrName === "number") {
      // performance optimization:
      // we can match by id directly without finding this column via query
      return fields.find(field => field.id === fieldIdOrName);
    }

    const fieldsWithName = fields.filter(
      field => typeof field.id === "number" && field.name === fieldIdOrName,
    );
    if (fieldsWithName.length === 1) {
      // performance optimization:
      // if there is exactly 1 field, assume that it's related to this query and do not call MBQL lib
      return fieldsWithName[0];
    }

    const columns = getParameterColumns(question, parameter);
    if (columns.length === 0) {
      // query and metadata are not available: 1) no data permissions 2) embedding
      // there is no way to find the correct field so pick the first one matching by name
      return fieldsWithName[0];
    }

    const query = question.query();
    const stageIndex = -1;
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
      // the column does not represent to a database field, e.g. coming from an aggregation clause
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
  return ["variable", normalize(variable.mbql())];
}

export function buildTextTagTarget(tagName: string): ParameterTextTarget {
  return ["text-tag", tagName];
}

export function getParameterColumns(question: Question, parameter?: Parameter) {
  // treat the dataset/model question like it is already composed so that we can apply
  // dataset/model-specific metadata to the underlying dimension options
  const query =
    question.type() !== "question"
      ? question.composeQuestionAdhoc().query()
      : question.query();
  const stageIndex = -1;
  const availableColumns =
    parameter && isTemporalUnitParameter(parameter)
      ? Lib.returnedColumns(query, stageIndex)
      : Lib.filterableColumns(query, stageIndex);
  return parameter
    ? availableColumns.filter(
        columnFilterForParameter(query, stageIndex, parameter),
      )
    : availableColumns;
}
