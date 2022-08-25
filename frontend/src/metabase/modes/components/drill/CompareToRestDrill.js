import { t } from "ttag";

import { isExpressionField } from "metabase/lib/query/field_ref";
import MetabaseSettings from "metabase/lib/settings";

export default ({ question, clicked }) => {
  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
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
