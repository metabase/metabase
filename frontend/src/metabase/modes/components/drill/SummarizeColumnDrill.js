/* eslint-disable react/prop-types */
import { fieldRefForColumn } from "metabase/lib/dataset";
import {
  getAggregationOperator,
  isCompatibleAggregationOperatorForField,
} from "metabase/lib/schema_metadata";
import { t } from "ttag";

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
    title: t`Distincts`,
  },
};

export default ({ question, clicked = {} }) => {
  const { column, value } = clicked;
  if (!column || value !== undefined) {
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
