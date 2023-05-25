import {
  isa,
  isDate,
  isNumeric,
  isTypeFK,
  isTypePK,
} from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";
import { isLocalField } from "metabase-lib/queries/utils";
import { fieldRefForColumn } from "metabase-lib/queries/utils/dataset";

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

  const { column, value } = clicked;
  if (isTypePK(column.semantic_type) || isTypeFK(column.semantic_type)) {
    return null;
  }

  const operators = getOperatorsForColumn(column, value);
  return { operators };
}

export function quickFilterDrillQuestion({ question, clicked, filter }) {
  const { column } = clicked;

  if (isLocalColumn(column)) {
    return question.query().filter(filter).question();
  } else {
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
    return question.query().nest().filter(filter).question();
  }
}

function getOperatorsForColumn(column, value) {
  const fieldRef = getColumnFieldRef(column);

  if (INVALID_TYPES.some(type => isa(column.base_type, type))) {
    return [];
  } else if (value == null) {
    return [
      { name: "=", filter: ["is-null", fieldRef] },
      { name: "≠", filter: ["not-null", fieldRef] },
    ];
  } else if (isNumeric(column) || isDate(column)) {
    return [
      { name: "<", filter: ["<", fieldRef, value] },
      { name: ">", filter: [">", fieldRef, value] },
      { name: "=", filter: ["=", fieldRef, value] },
      { name: "≠", filter: ["!=", fieldRef, value] },
    ];
  } else {
    return [
      { name: "=", filter: ["=", fieldRef, value] },
      { name: "≠", filter: ["!=", fieldRef, value] },
    ];
  }
}

function isLocalColumn(column) {
  return isLocalField(column.field_ref);
}

function getColumnFieldRef(column) {
  if (isLocalColumn(column)) {
    return fieldRefForColumn(column);
  } else {
    return ["field", column.name, { "base-type": column.base_type }];
  }
}
