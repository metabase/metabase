/* @flow */

import React from "react";
import { t } from "c-3po";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

import { isDate } from "metabase/lib/schema_metadata";

export default ({ question }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  const dateField = query.table().fields.filter(isDate)[0];
  if (!dateField) {
    return [];
  }

  return [
    {
      name: "count-by-time",
      section: "sum",
      title: <span>{t`Count of rows by time`}</span>,
      icon: "line",
      question: () =>
        question
          .summarize(["count"])
          .breakout([
            "datetime-field",
            ["field-id", dateField.id],
            "as",
            "day",
          ]),
    },
  ];
};
