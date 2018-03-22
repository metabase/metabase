/* @flow */

import { inflect } from "metabase/lib/formatting";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { t } from "c-3po";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  // questions with a breakout
  const dimensions = (clicked && clicked.dimensions) || [];
  if (!clicked || dimensions.length === 0) {
    return [];
  }

  return [
    {
      name: "exploratory-dashboard",
      section: "auto",
      title: t`Create exploratory dashboard`,
      url: () => {
        const filters = question
          .drillUnderlyingRecords(dimensions)
          .query()
          .filters();
        return question.getAutomaticDashboardUrl(filters);
      },
    },
  ];
};
