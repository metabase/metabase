import {
  ClickObject,
  DimensionValue,
} from "metabase-types/types/Visualization";
import { LocalFieldReference } from "metabase-types/types/Query";
import { drillDownForDimensions } from "metabase-lib/queries/utils/drilldown";
import Question from "metabase-lib/Question";

export const getNextZoomDrilldown = (
  question: Question,
  clicked: ClickObject | undefined,
): {
  dimensions: DimensionValue[];
  drilldown: { breakouts: LocalFieldReference[] };
} | null => {
  const dimensions = clicked?.dimensions ?? [];
  const drilldown = drillDownForDimensions(dimensions, question.metadata());

  if (drilldown) {
    return {
      dimensions,
      drilldown,
    };
  }

  return null;
};

export function zoomDrillQuestion(
  question: Question,
  dimensions: DimensionValue[],
  drilldown: { breakouts: LocalFieldReference[] },
) {
  return question.pivot(drilldown?.breakouts, dimensions);
}
