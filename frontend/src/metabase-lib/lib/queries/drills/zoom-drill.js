import { drillDownForDimensions } from "metabase-lib/lib/queries/utils/drilldown";

export function zoomDrill({ question, clicked }) {
  if (!question.query().isEditable()) {
    return null;
  }

  const dimensions = (clicked && clicked.dimensions) || [];
  const drilldown = drillDownForDimensions(dimensions, question.metadata());
  if (!drilldown) {
    return null;
  }

  return true;
}

export function zoomDrillQuestion({ question, clicked }) {
  const dimensions = (clicked && clicked.dimensions) || [];
  const drilldown = drillDownForDimensions(dimensions, question.metadata());

  return question.pivot(drilldown.breakouts, dimensions);
}
