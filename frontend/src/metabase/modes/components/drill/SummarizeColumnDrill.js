/* eslint-disable react/prop-types */
import { fieldRefForColumn } from "metabase/lib/dataset";
import { t } from "ttag";
import _ from "underscore";

import { TYPE, isa } from "metabase/lib/types";
import {
  getAggregationOperator,
  isCompatibleAggregationOperatorForField,
} from "metabase/lib/schema_metadata";

const INVALID_TYPES = [TYPE.Structured];

const AGGREGATIONS = {
  sum: {
    section: "sum",
    buttonType: "token",
    title: t`Sum`,
  },
  avg: {
    section: "sum",
    buttonType: "token",
    title: t`Avg`,
  },
  distinct: {
    section: "sum",
    buttonType: "token",
    title: t`Distinct values`,
  },
};

export default ({ question, clicked = {} }) => {
  const { column, value } = clicked;
  if (
    !column ||
    value !== undefined ||
    _.any(INVALID_TYPES, type => isa(clicked.column.base_type, type))
  ) {
    return [];
  }

  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return [];
  }

  return Object.entries(AGGREGATIONS)
    .map(([aggregationShort, action]) => [
      getAggregationOperator(aggregationShort),
      action,
    ])
    .filter(([aggregator]) =>
      isCompatibleAggregationOperatorForField(aggregator, column),
    )
    .map(([aggregator, action]) => ({
      name: action.title.toLowerCase(),
      ...action,
      question: () =>
        query
          .aggregate([aggregator.short, fieldRefForColumn(column)])
          .question()
          .setDefaultDisplay(),
      action: () => dispatch => {
        // HACK: drill through closes sidebars, so open sidebar asynchronously
        setTimeout(() => {
          dispatch({ type: "metabase/qb/EDIT_SUMMARY" });
        });
      },
    }));
};
