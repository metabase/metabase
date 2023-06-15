import { t } from "ttag";
import * as Lib from "metabase-lib";
import { LocalFieldReference } from "metabase-types/api";
import type {
  ClickObject,
  ClickObjectDimension,
} from "metabase-lib/queries/drills/types";
import { drillDownForDimensions } from "metabase-lib/queries/utils/drilldown";
import Question from "metabase-lib/Question";
import { FieldDimension } from "metabase-lib/Dimension";

export const getNextZoomDrilldown = (
  question: Question,
  clicked: ClickObject | undefined,
): {
  dimensions: ClickObjectDimension[];
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
  dimensions: ClickObjectDimension[],
  drilldown: { breakouts: LocalFieldReference[] },
): string => {
  let currentGranularity;
  dimensions.some(dimension => {
    if (dimension.column?.field_ref) {
      const field = FieldDimension.parseMBQL(dimension.column.field_ref);
      if (field && field.temporalUnit()) {
        currentGranularity = Lib.describeTemporalUnit(
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
      newGranularity = Lib.describeTemporalUnit(
        field.temporalUnit(),
      ).toLowerCase();
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
  dimensions: ClickObjectDimension[],
  drilldown: { breakouts: LocalFieldReference[] },
) {
  return question.pivot(drilldown?.breakouts, dimensions);
}
