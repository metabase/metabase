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
    !MetabaseSettings.get("enable-xrays") ||
    includesExpressionDimensions;

  if (isUnsupportedDrill) {
    return [];
  }

  return [
    {
      name: "exploratory-dashboard",
      section: "auto",
      icon: "bolt",
      buttonType: "token",
      title: t`X-ray`,
      url: () => {
        const filters = query
          .clearFilters() // clear existing filters so we don't duplicate them
          .question()
          .drillUnderlyingRecords(dimensions)
          .query()
          .filters();
        return question.getAutomaticDashboardUrl(filters);
      },
    },
  ];
};
