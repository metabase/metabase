/* eslint-disable react/prop-types */
import React from "react";

import { isFK, isPK, TYPE, isa } from "metabase/lib/types";
import { isDate, isNumeric } from "metabase/lib/schema_metadata";
import { isLocalField } from "metabase-lib/lib/queries/utils/field-ref";

const INVALID_TYPES = [TYPE.Structured];

function getFiltersForColumn(column) {
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

function getComparisonFilter({ question, name, operator, column, value }) {
  return {
    name: operator,
    section: "filter",
    buttonType: "token-filter",
    title: <span className="h2">{name}</span>,
    question: () => {
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
    },
  };
}

export default function QuickFilterDrill({ question, clicked }) {
  const query = question.query();
  if (
    !question.isStructured() ||
    !query.isEditable() ||
    !clicked?.column ||
    clicked.value === undefined
  ) {
    return [];
  }

  const { value, column } = clicked;

  if (isPK(column.semantic_type)) {
    return [];
  }

  if (isFK(column.semantic_type)) {
    return [];
  }

  const operators = getFiltersForColumn(column) || [];
  return operators.map(({ name, operator }) =>
    getComparisonFilter({ question, name, operator, column, value }),
  );
}
