import * as ML_Urls from "metabase-lib/urls";
import { isExpressionField } from "metabase-lib/queries/utils";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type { ClickActionProps } from "metabase-lib/queries/drills/types";

export function automaticInsightsDrill({
  question,
  clicked,
  enableXrays,
}: ClickActionProps & { enableXrays?: boolean }) {
  const query = question.query();

  if (!question.isStructured() || !query.isEditable()) {
    return false;
  }

  // questions with a breakout
  const dimensions = (clicked && clicked.dimensions) || [];

  // ExpressionDimensions don't work right now (see metabase#16680)
  const includesExpressionDimensions = dimensions.some(dimension => {
    return isExpressionField(dimension.column?.field_ref);
  });

  const isUnsupportedDrill =
    !clicked ||
    dimensions.length === 0 ||
    !enableXrays ||
    includesExpressionDimensions;

  return !isUnsupportedDrill;
}

export function automaticDashboardDrillUrl({
  question,
  clicked,
}: ClickActionProps) {
  const query = question.query() as StructuredQuery;
  const dimensions = (clicked && clicked.dimensions) || [];

  const nextQuery = query
    .clearFilters() // clear existing filters so we don't duplicate them
    .question()
    .drillUnderlyingRecords(dimensions)
    .query() as StructuredQuery;
  const filters = nextQuery.filters();

  return ML_Urls.getAutomaticDashboardUrl(question, filters);
}

export function compareToRestDrillUrl({ question, clicked }: ClickActionProps) {
  const query = question.query() as StructuredQuery;
  const dimensions = (clicked && clicked.dimensions) || [];

  const nextQuery = query
    .clearFilters() // clear existing filters so we don't duplicate them
    .question()
    .drillUnderlyingRecords(dimensions)
    .query() as StructuredQuery;
  const filters = nextQuery.filters();

  return ML_Urls.getComparisonDashboardUrl(question, filters);
}
