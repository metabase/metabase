/* @flow */

import { getFieldRefFromColumn } from "metabase/qb/lib/actions";
import {
  getAggregator,
  isCompatibleAggregatorForField,
} from "metabase/lib/schema_metadata";
import { t } from "c-3po";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

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

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined ||
    clicked.column.source !== "fields"
  ) {
    // TODO Atte Keinänen 7/21/17: Does it slow down the drill-through option calculations remarkably
    // that I removed the `isSummable` condition from here and use `isCompatibleAggregator` method below instead?
    return [];
  }
  const { column } = clicked;

  return Object.entries(AGGREGATIONS)
    .map(([aggregationShort, action]) => [
      getAggregator(aggregationShort),
      // $FlowFixMe
      action,
    ])
    .filter(([aggregator]) =>
      isCompatibleAggregatorForField(aggregator, column),
    )
    .map(([aggregator, action]: [any, { section: string, title: string }]) => ({
      name: action.title.toLowerCase(),
      ...action,
      question: () =>
        question.summarize([aggregator.short, getFieldRefFromColumn(column)]),
    }));
};
