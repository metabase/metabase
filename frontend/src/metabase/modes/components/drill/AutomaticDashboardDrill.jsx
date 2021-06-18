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

  // these don't seem to work
  const includesExpressionDimensions = dimensions.some(dimension => {
    return isExpressionField(dimension.column.field_ref);
  });

  if (
    !clicked ||
    dimensions.length === 0 ||
    !MetabaseSettings.get("enable-xrays") ||
    includesExpressionDimensions
  ) {
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
