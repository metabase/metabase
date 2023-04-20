import { t } from "ttag";
import {
  ClickObject,
  DimensionValue,
} from "metabase-types/types/Visualization";
import { LocalFieldReference } from "metabase-types/types/Query";
import { drillDownForDimensions } from "metabase-lib/queries/utils/drilldown";
import Question from "metabase-lib/Question";
import { FieldDimension } from "metabase-lib/Dimension";
import { formatBucketing } from "metabase-lib/queries/utils/query-time";

export const getNextZoomDrilldown = (
  question: Question,
  clicked: ClickObject | undefined,
): {
  dimensions: DimensionValue[];
  drilldown: { breakouts: LocalFieldReference[] };
} | null => {
  if (!question.query().isEditable()) {
    return null;
  }

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

export const getZoomDrillTitle = (
  dimensions: DimensionValue[],
  drilldown: { breakouts: LocalFieldReference[] },
): string => {
  let currentGranularity;
  dimensions.some(dimension => {
    if (dimension.column.field_ref) {
      const field = FieldDimension.parseMBQL(dimension.column.field_ref);
      if (field && field.temporalUnit()) {
        currentGranularity = formatBucketing(
          field.temporalUnit(),
        ).toLowerCase();
        return true;
      }
    }
  });

  let newGranularity;
  drilldown.breakouts.some(breakout => {
    const field = FieldDimension.parseMBQL(breakout);
    if (field && field.temporalUnit()) {
      newGranularity = formatBucketing(field.temporalUnit()).toLowerCase();
      return true;
    }
  });

  if (currentGranularity && newGranularity) {
    return t`See this ${currentGranularity} by ${newGranularity}`;
  }

  return t`Zoom in`;
};

export function zoomDrillQuestion(
  question: Question,
  dimensions: DimensionValue[],
  drilldown: { breakouts: LocalFieldReference[] },
) {
  return question.pivot(drilldown?.breakouts, dimensions);
}
