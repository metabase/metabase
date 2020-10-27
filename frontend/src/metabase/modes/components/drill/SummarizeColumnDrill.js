/* @flow */

import { fieldRefForColumn } from "metabase/lib/dataset";
import {
  getAggregationOperator,
  isCompatibleAggregationOperatorForField,
} from "metabase/lib/schema_metadata";
import { t } from "ttag";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const AGGREGATIONS = {
  sum: {
    section: "sum",
    title: t`Sum`,
  },
  avg: {
    section: "sum",
    title: t`Avg`,
  },
  min: {
    section: "sum",
    title: t`Min`,
  },
  max: {
    section: "sum",
    title: t`Max`,
  },
  distinct: {
    section: "sum",
    title: t`Distincts`,
  },
};

export default ({
  question,
  clicked = {},
}: ClickActionProps): ClickAction[] => {
  const { column, value } = clicked;
  if (!column || column.source !== "fields" || value !== undefined) {
    // TODO Atte Keinänen 7/21/17: Does it slow down the drill-through option calculations remarkably
    // that I removed the `isSummable` condition from here and use `isCompatibleAggregator` method below instead?
    return [];
  }

  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  return Object.entries(AGGREGATIONS)
    .map(([aggregationShort, action]) => [
      getAggregationOperator(aggregationShort),
      // $FlowFixMe
      action,
    ])
    .filter(([aggregator]) =>
      isCompatibleAggregationOperatorForField(aggregator, column),
    )
    .map(([aggregator, action]: [any, { section: string, title: string }]) => ({
      name: action.title.toLowerCase(),
      ...action,
      question: () =>
        query
          // $FlowFixMe
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
