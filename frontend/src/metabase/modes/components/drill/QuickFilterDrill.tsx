/* eslint-disable react/prop-types */
import React from "react";
import { jt, t } from "ttag";
import cx from "classnames";

import { isFK, isPK, TYPE, isa } from "metabase/lib/types";
import { isLocalField } from "metabase/lib/query/field_ref";
import {
  isDate,
  isLongText,
  isNumeric,
  isString,
} from "metabase/lib/schema_metadata";
import { Column, Value } from "metabase-types/types/Dataset";
import { singularize, pluralize, stripId } from "metabase/lib/formatting";
import {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";

const INVALID_TYPES = [TYPE.Structured];

type ColumnFilter = {
  name: string;
  operator: string;
  icon?: string;
  section?: string;
};

function getFiltersForColumn(column: Column, value: Value): ColumnFilter[] {
  const section = "filter";
  if (isNumeric(column) || isDate(column)) {
    return [
      { name: "<", operator: "<", section },
      { name: ">", operator: ">", section },
      { name: "=", operator: "=", section },
      { name: "≠", operator: "!=", section },
    ];
  } else if (isLongText(column)) {
    return [
      {
        name: t`Contains...`,
        operator: "contains",
        section: "shortcut",
        icon: "filter",
      },
      {
        name: t`Does not contain...`,
        operator: "does-not-contain",
        section: "shortcut",
        icon: "!=",
      },
    ];
  } else if (isString(column)) {
    return [
      {
        name: t`Is ${value}`,
        operator: "=",
        section: "shortcut",
        icon: "filter",
      },
      {
        name: t`Is not ${value}`,
        operator: "!=",
        section: "shortcut",
        icon: "!=",
      },
    ];
  } else if (!INVALID_TYPES.some(type => isa(column.base_type, type))) {
    return [
      { name: "=", operator: "=", section },
      { name: "≠", operator: "!=", section },
    ];
  } else {
    return [];
  }
}

type GetFKFilter = {
  question: Question;
  query: StructuredQuery;
  column: Column;
  value: Value;
};

function getFKFilter({
  question,
  query,
  column,
  value,
}: GetFKFilter): ClickAction {
  const formattedColumnName = singularize(stripId(column.display_name));
  const formattedTableName = pluralize(query.table()?.display_name || "table");
  return {
    name: "view-fks",
    section: "standalone_filter",
    buttonType: "horizontal" as const,
    icon: "filter",
    title: (
      <span>
        {jt`View this ${formattedColumnName}'s ${formattedTableName}`}
      </span>
    ),
    question: () => question.filter("=", column, value),
  };
}

function getFieldLiteralFromColumn(column: Column) {
  return ["field", column.name, { "base-type": column.base_type }];
}

type ComparisonFilter = {
  question: Question;
  name: string;
  operator: string;
  column: Column;
  value: Value;
  icon?: string;
  section?: string;
};

function getComparisonFilter({
  question,
  name,
  operator,
  column,
  value,
  icon,
  section,
}: ComparisonFilter): ClickAction {
  const base = { icon, name: operator, section };
  const query = getStructuredQuery(question);
  if (isLongText(column)) {
    return {
      ...base,
      buttonType: "horizontal",
      title: <span>{name}</span>,
      popover: function QuickDrillFilterPopover({
        onChangeCardAndRun,
        onClose,
      }) {
        return (
          <FilterPopover
            query={query}
            filter={
              new Filter(
                [
                  operator,
                  column.field_ref,
                  undefined,
                  { "case-sensitive": false },
                ],
                null,
                query,
              )
            }
            onClose={onClose}
            onChangeFilter={filter => {
              const nextCard = query.filter(filter).question().card();
              onChangeCardAndRun({ nextCard });
              onClose();
            }}
            showFieldPicker={false}
            isNew={true}
          />
        );
      },
    };
  } else {
    return {
      ...base,
      buttonType: section === "filter" ? "token-filter" : "horizontal",
      title: <span className={cx({ h2: section === "filter" })}>{name}</span>,
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

        const query = getStructuredQuery(question);
        const nestedQuestion = query.nest().question();

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
}

export default function QuickFilterDrill({
  question,
  clicked,
}: ClickActionProps): ClickAction[] {
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
    return [getFKFilter({ question, query, column, value })];
  }

  const operators = getFiltersForColumn(column, value) || [];
  const actions = operators.map(operator =>
    getComparisonFilter({ question, column, value, ...operator }),
  );
  isLongText(column) && console.log("............", actions);
  return actions;
}

const getStructuredQuery = (question: Question): StructuredQuery => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    throw new Error("Can't add filter to a question with a NativeQuery");
  }
  return query;
};
