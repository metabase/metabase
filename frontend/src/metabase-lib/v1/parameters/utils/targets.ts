import _ from "underscore";

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

  const fieldRef = target[1];
  const metadata = question.metadata();

  // native queries
  if (isTemplateTagReference(fieldRef)) {
    if (!Lib.queryDisplayInfo(question.query()).isNative) {
      return null;
    }

    const dimension = TemplateTagDimension.parseMBQL(
      fieldRef,
      metadata,
      question.legacyQuery() as NativeQuery,
    );
    return dimension?.field();
  }

  if (isConcreteFieldReference(fieldRef)) {
    const [_type, fieldIdOrName] = fieldRef;
    const fields = metadata.fieldsList();
    if (typeof fieldIdOrName === "number") {
      // performance optimization:
      // we can match by id directly without finding this column via query
      return fields.find(field => field.id === fieldIdOrName);
    }

    const { query, columns } = getParameterColumns(question, parameter);

    if (columns.length === 0) {
      // query and metadata are not available: 1) no data permissions 2) embedding
      // there is no way to find the correct field so pick the first one matching by name
      return fields.find(
        field => typeof field.id === "number" && field.name === fieldIdOrName,
      );
    }

    const stageIndexes = _.uniq(columns.map(({ stageIndex }) => stageIndex));

    for (const stageIndex of stageIndexes) {
      const stageColumns = columns
        .filter(column => column.stageIndex === stageIndex)
        .map(({ column }) => column);

      const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
        query,
        stageIndex,
        stageColumns,
        [fieldRef],
      );

      if (columnIndex >= 0) {
        const column = stageColumns[columnIndex];
        const fieldValuesInfo = Lib.fieldValuesSearchInfo(query, column);

        if (fieldValuesInfo.fieldId == null) {
          // the column does not represent to a database field, e.g. coming from an aggregation clause
          return null;
        }

        // do not use `metadata.field(id)` because it only works for fields loaded
        // with the original table, not coming from model metadata
        return fields.find(field => field.id === fieldValuesInfo.fieldId);
      }
    }
  }

  return null;
}

export function buildDimensionTarget(
  dimension: TemplateTagDimension,
  stageIndex: number,
): NativeParameterDimensionTarget {
  return ["dimension", dimension.mbql(), { "stage-number": stageIndex }];
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

  const availableColumns = getFilterableColumns(nextQuery);
  const columns = parameter
    ? availableColumns.filter(({ column, stageIndex }) =>
        columnFilterForParameter(nextQuery, stageIndex, parameter)(column),
      )
    : availableColumns;

  return { query: nextQuery, columns };
}

function getTemporalColumns(query: Lib.Query, stageIndex: number) {
  const columns = Lib.breakouts(query, stageIndex).map(breakout => {
    return Lib.breakoutColumn(query, stageIndex, breakout);
  });
  const [group] = Lib.groupColumns(columns);

  return columns.map(column => ({
    stageIndex,
    column,
    group,
  }));
}

function getFilterableColumns(query: Lib.Query) {
  return Lib.stageIndexes(query).flatMap(stageIndex => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const groups = Lib.groupColumns(columns);

    return groups.flatMap(group => {
      const columns = Lib.getColumnsFromColumnGroup(group);

      return columns.map(column => ({
        stageIndex,
        column,
        group,
      }));
    });
  });
}
