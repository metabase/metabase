/* @flow */

import { t } from "c-3po";
import { isPK } from "metabase/lib/schema_metadata";

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
    isPK(clicked.column)
  ) {
    return [];
  }
  const { column } = clicked;

  return [
    {
      name: "distribution",
      title: t`Distribution`,
      section: "distribution",
      question: () => question.distribution(column),
    },
  ];
};
