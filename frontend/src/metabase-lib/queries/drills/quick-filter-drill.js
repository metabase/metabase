import {
  isa,
  isTypeFK,
  isTypePK,
  isDate,
  isNumeric,
} from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";
import { isLocalField } from "metabase-lib/queries/utils";

const INVALID_TYPES = [TYPE.Structured];

export function quickFilterDrill({ question, clicked }) {
  const query = question.query();
  if (
    !question.isStructured() ||
    !query.isEditable() ||
    !clicked ||
    !clicked.column ||
    clicked.value === undefined
  ) {
    return null;
  }

  const { column } = clicked;
  if (isTypePK(column.semantic_type) || isTypeFK(column.semantic_type)) {
    return null;
  }

  const operators = getOperatorsForColumn(column);
  return { operators };
}

export function quickFilterDrillQuestion({ question, clicked, operator }) {
  const { column, value } = clicked;

  if (isLocalField(column.field_ref)) {
    return question.filter(operator, column, value);
  }

  /**
   * For aggregated and custom columns
   * with field refs like ["aggregation", 0],
   * we need to nest the query as filters like ["=", ["aggregation", 0], value] won't work
   *
   * So the query like
   * {
   *   aggregations: [["count"]]
   *   source-table: 2,
   * }
   *
   * Becomes
   * {
   *   source-query: {
   *      aggregations: [["count"]]
   *     source-table: 2,
   *   },
   *   filter: ["=", [ "field", "count", {"base-type": "type/BigInteger"} ], value]
   * }
   */

  const nestedQuestion = question.query().nest().question();

  return nestedQuestion.filter(
    operator,
    {
      ...column,
      field_ref: getFieldLiteralFromColumn(column),
    },
    value,
  );
}

function getOperatorsForColumn(column) {
  if (isNumeric(column) || isDate(column)) {
    return [
      { name: "<", operator: "<" },
      { name: ">", operator: ">" },
      { name: "=", operator: "=" },
      { name: "≠", operator: "!=" },
    ];
  } else if (!INVALID_TYPES.some(type => isa(column.base_type, type))) {
    return [
      { name: "=", operator: "=" },
      { name: "≠", operator: "!=" },
    ];
  } else {
    return [];
  }
}

function getFieldLiteralFromColumn(column) {
  return ["field", column.name, { "base-type": column.base_type }];
}
