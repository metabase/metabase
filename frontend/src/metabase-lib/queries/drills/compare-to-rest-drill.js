import { isExpressionField } from "metabase-lib/queries/utils";

export function compareToRestDrill({ question, clicked, enableXrays }) {
  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return false;
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
    !enableXrays ||
    includesExpressionDimensions;

  return !isUnsupportedDrill;
}

export function compareToRestDrillUrl({ question, clicked }) {
  const query = question.query();
  const dimensions = (clicked && clicked.dimensions) || [];
  const filters = query
    .clearFilters() // clear existing filters so we don't duplicate them
    .question()
    .drillUnderlyingRecords(dimensions)
    .query()
    .filters();

  return question.getComparisonDashboardUrl(filters);
}
