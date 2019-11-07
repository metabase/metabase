/* @flow */

import React from "react";
import { t } from "ttag";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default ({ question }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  const dateDimension = query
    .dimensionOptions(d => d.field().isDate())
    .all()[0];
  if (!dateDimension) {
    return [];
  }

  return [
    {
      name: "count-by-time",
      section: "sum",
      title: <span>{t`Count of rows by time`}</span>,
      icon: "line",
      question: () =>
        query
          .aggregate(["count"])
          .breakout(dateDimension.defaultDimension().mbql())
          .question()
          .setDefaultDisplay(),
    },
  ];
};
