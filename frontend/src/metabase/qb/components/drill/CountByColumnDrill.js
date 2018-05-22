/* @flow */

import React from "react";
import { t } from "c-3po";
import { getFieldRefFromColumn } from "metabase/qb/lib/actions";
import { isCategory } from "metabase/lib/schema_metadata";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined ||
    clicked.column.source !== "fields" ||
    !isCategory(clicked.column)
  ) {
    return [];
  }
  const { column } = clicked;

  return [
    {
      name: "count-by-column",
      section: "distribution",
      title: <span>{t`Distribution`}</span>,
      question: () =>
        question.summarize(["count"]).pivot([getFieldRefFromColumn(column)]),
    },
  ];
};
