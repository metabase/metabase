/* @flow */

import React from "react";
import { t } from "c-3po";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { getFieldRefFromColumn } from "metabase/qb/lib/actions";
import {
  isDate,
  getAggregator,
  isCompatibleAggregatorForField,
} from "metabase/lib/schema_metadata";
import { capitalize } from "metabase/lib/formatting";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  const dateField = query.table().fields.filter(isDate)[0];
  if (
    !dateField ||
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined
  ) {
    return [];
  }
  const { column } = clicked;
  const pivotFieldRef = isDate(column)
    ? getFieldRefFromColumn(column)
    : ["field-id", dateField.id];

  return ["sum"]
    .map(getAggregator)
    .filter(aggregator => isCompatibleAggregatorForField(aggregator, column))
    .map(aggregator => ({
      name: "summarize-by-time",
      section: "distribution",
      title: (
        <span>
          {capitalize(aggregator.short)} {t`over time`}
        </span>
      ),
      question: () =>
        question
          .summarize(
            aggregator.requiresField
              ? [aggregator.short, getFieldRefFromColumn(column)]
              : [aggregator.short],
          )
          .pivot([["datetime-field", pivotFieldRef, "day"]]),
    }));
};
