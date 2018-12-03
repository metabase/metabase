/* @flow */

import React from "react";
import { jt } from "c-3po";
import { TYPE, isa, isFK, isPK } from "metabase/lib/types";
import { singularize, pluralize, stripId } from "metabase/lib/formatting";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

function getFiltersForColumn(column) {
  if (
    isa(column.base_type, TYPE.Number) ||
    isa(column.base_type, TYPE.DateTime)
  ) {
    return [
      { name: "<", operator: "<" },
      { name: "=", operator: "=" },
      { name: "≠", operator: "!=" },
      { name: ">", operator: ">" },
    ];
  } else {
    return [{ name: "=", operator: "=" }, { name: "≠", operator: "!=" }];
  }
}

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (
    !(query instanceof StructuredQuery) ||
    !clicked ||
    !clicked.column ||
    clicked.column.id == null ||
    clicked.value == undefined
  ) {
    return [];
  }

  const { value, column } = clicked;

  if (isPK(column.special_type)) {
    return [];
  }
  if (isFK(column.special_type)) {
    return [
      {
        name: "view-fks",
        section: "filter",
        title: (
          <span>
            {jt`View this ${singularize(
              stripId(column.display_name),
            )}'s ${pluralize(query.table().display_name)}`}
          </span>
        ),
        question: () => question.filter("=", column, value),
      },
    ];
  }

  let operators = getFiltersForColumn(column) || [];
  return operators.map(({ name, operator }) => ({
    name: operator,
    section: "filter",
    title: <span className="h2">{name}</span>,
    question: () => question.filter(operator, column, value),
  }));
};
