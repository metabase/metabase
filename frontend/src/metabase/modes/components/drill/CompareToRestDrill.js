import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { t } from "ttag";
import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

import { isExpressionField } from "metabase/lib/query/field_ref";
import MetabaseSettings from "metabase/lib/settings";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return [];
  }

  // questions with a breakout
  const dimensions = (clicked && clicked.dimensions) || [];

  // ExpressionDimensions don't work right now (see metabase#16680)
  const includesExpressionDimensions = dimensions.some(dimension => {
    return isExpressionField(dimension.column.field_ref);
  });

  const isUnsupportedDrill =
    !clicked ||
    dimensions.length === 0 ||
    // xrays must be enabled for this to work
    !MetabaseSettings.get("enable-xrays") ||
    includesExpressionDimensions;

  if (isUnsupportedDrill) {
    return [];
  }

  return [
    {
      name: "compare-dashboard",
      section: "auto",
      icon: "bolt",
      buttonType: "token",
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
