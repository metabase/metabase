import { drillDownForDimensions } from "metabase-lib/lib/queries/utils/drilldown";

export function zoomDrill({ question, clicked }) {
  if (!question.query().isEditable()) {
    return false;
  }

  const dimensions = clicked?.dimensions ?? [];
  const drilldown = drillDownForDimensions(dimensions, question.metadata());
  return drilldown != null;
}

export function zoomDrillQuestion({ question, clicked }) {
  const dimensions = (clicked && clicked.dimensions) || [];
  const drilldown = drillDownForDimensions(dimensions, question.metadata());

  return question.pivot(drilldown.breakouts, dimensions);
}
