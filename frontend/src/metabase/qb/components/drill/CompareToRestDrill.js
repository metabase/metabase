/* @flow */

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
      name: "compare-dashboard",
      section: "auto",
      icon: "bolt",
      title: t`Compare to the rest`,
      url: () => {
        const filters = query
          .clearFilters() // clear existing filters so we don't duplicate them
          .question()
          .drillUnderlyingRecords(dimensions)
          .query()
          .filters();
        return question.getComparisonDashboardUrl(filters);
      },
    },
  ];
};
