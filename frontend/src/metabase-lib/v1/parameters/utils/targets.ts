import _ from "underscore";

import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isTemplateTagReference } from "metabase-lib/v1/references";
import type {
  ConcreteFieldReference,
  FieldId,
  FieldReference,
  NativeParameterDimensionTarget,
  Parameter,
  ParameterTarget,
  ParameterTextTarget,
  ParameterVariableTarget,
  StructuredParameterDimensionTarget,
  TemplateTag,
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

export function isTextTagTarget(
  target: ParameterTarget,
): target is ParameterTextTarget {
  return target[0] === "text-tag";
}

export function getTemplateTagFromTarget(target: ParameterTarget) {
  if (!target?.[1] || isTextTagTarget(target)) {
    return null;
  }

  const [, [type, tag]] = target;
  return type === "template-tag" ? tag : null;
}

export function getTextTagFromTarget(target: ParameterTarget) {
  if (!target?.[1] || !isTextTagTarget(target)) {
    return null;
  }

  return target[1];
}

/**
 * Returns only real DB fields and not all mapped columns.
 * Use getMappingOptionByTarget for columns.
 */
export function getParameterTargetField(
  question: Question,
  parameter: Parameter,
  target: ParameterTarget,
) {
  if (!isDimensionTarget(target)) {
    return null;
  }

  const targetRef = target[1];

  // native queries
  if (isTemplateTagReference(targetRef)) {
    const query = question.query();
    if (!Lib.queryDisplayInfo(query).isNative) {
      return null;
    }

    const tagName = targetRef[1];
    const fieldId = Lib.templateTags(query).find(
      (tag) => tag.name === tagName,
    )?.["field-id"];
    if (fieldId == null) {
      return null;
    }

    return findField(query, fieldId);
  }

  // mbql queries
  if (isConcreteFieldReference(targetRef)) {
    return getParameterTargetFieldFromFieldRef(question, parameter, targetRef);
  }

  return null;
}

function findField(
  query: Lib.Query,
  fieldId: FieldId,
): Lib.ParameterFieldInfo | undefined {
  const column = Lib.fieldMetadata(query, fieldId);
  return (column != null && Lib.parameterFieldInfo(query, column)) || undefined;
}

function getParameterTargetFieldFromFieldRef(
  question: Question,
  parameter: Parameter,
  fieldRef: ConcreteFieldReference,
) {
  const [_type, fieldIdOrName] = fieldRef;
  if (typeof fieldIdOrName === "number") {
    // performance optimization:
    // we can match by id directly without finding this column via query
    return findField(question.query(), fieldIdOrName);
  }

  const { query, columns } = getParameterColumns(question, parameter);
  const stageIndexes = _.uniq(columns.map(({ stageIndex }) => stageIndex));

  for (const stageIndex of stageIndexes) {
    const stageColumns = columns
      .filter((column) => column.stageIndex === stageIndex)
      .map(({ column }) => column);

    const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      stageColumns,
      [fieldRef],
    );

    if (columnIndex >= 0) {
      const { id: fieldId } = Lib.pickerInfo(query, stageColumns[columnIndex]);
      return fieldId != null ? findField(query, fieldId) : null;
    }
  }

  return null;
}

export function buildTemplateTagDimensionTarget(
  tag: TemplateTag,
  stageIndex: number,
): NativeParameterDimensionTarget {
  return [
    "dimension",
    ["template-tag", tag.name],
    { "stage-number": stageIndex },
  ];
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

  return ["dimension", fieldRef, { "stage-number": stageIndex }];
}

export function buildTemplateTagVariableTarget(
  tag: TemplateTag,
): ParameterVariableTarget | NativeParameterDimensionTarget {
  if (tag.type === "temporal-unit") {
    return ["dimension", ["template-tag", tag.name], { "stage-number": 0 }];
  } else {
    return ["variable", ["template-tag", tag.name]];
  }
}

export function buildTextTagTarget(tagName: string): ParameterTextTarget {
  return ["text-tag", tagName];
}

export type GetParameterColumnsOpts = {
  includeSensitiveFields?: boolean;
};

export function getParameterColumns(
  question: Question,
  parameter?: Parameter,
  opts?: GetParameterColumnsOpts,
) {
  // treat the dataset/model question like it is already composed so that we can apply
  // dataset/model-specific metadata to the underlying dimension options
  const query =
    question.type() !== "question"
      ? question.composeQuestionAdhoc().query()
      : question.query();

  // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations
  const nextQuery =
    question.display() === "pivot" ? query : Lib.ensureFilterStage(query);

  if (parameter && isTemporalUnitParameter(parameter)) {
    const stageIndex = Lib.stageCount(query) - 1;
    const availableColumns = getTemporalColumns(nextQuery, stageIndex);
    const columns = availableColumns.filter(({ column, stageIndex }) => {
      return columnFilterForParameter(nextQuery, stageIndex, parameter)(column);
    });

    return { query: nextQuery, columns };
  }

  const availableColumns = getFilterableColumns(nextQuery, opts);
  const columns = parameter
    ? availableColumns.filter(({ column, stageIndex }) =>
        columnFilterForParameter(nextQuery, stageIndex, parameter)(column),
      )
    : availableColumns;

  return { query: nextQuery, columns };
}

function getTemporalColumns(query: Lib.Query, stageIndex: number) {
  const columns = Lib.breakouts(query, stageIndex)
    .map((breakout) => Lib.breakoutColumn(query, stageIndex, breakout))
    .filter(isNotNull);
  const [group] = Lib.groupColumns(columns);

  return columns.map((column) => ({
    stageIndex,
    column,
    group,
  }));
}

function getFilterableColumns(
  query: Lib.Query,
  opts?: GetParameterColumnsOpts,
) {
  return Lib.stageIndexes(query).flatMap((stageIndex) => {
    const columns = Lib.filterableColumns(query, stageIndex, opts);
    const groups = Lib.groupColumns(columns);

    return groups.flatMap((group) => {
      const columns = Lib.getColumnsFromColumnGroup(group);

      return columns.map((column) => ({
        stageIndex,
        column,
        group,
      }));
    });
  });
}
