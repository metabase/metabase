/* @flow */

import { t } from "c-3po";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";
import { isPK } from "metabase/lib/schema_metadata";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (
    !clicked ||
    !clicked.column ||
    clicked.value !== undefined ||
    clicked.column.source !== "fields"
  ) {
    return [];
  }
  const { column } = clicked;

  if (!isPK(column)) {
    return [
      {
        name: "distribution",
        title: t`Distribution`,
        section: "averages",
        question: () => question.distribution(column),
      },
    ];
  } else {
    return [];
  }
};
