import { t } from "ttag";
import type { DimensionValue } from "metabase-types/types/Visualization";
import { LocalFieldReference } from "metabase-types/types/Query";
import {
  getNextZoomDrilldown,
  zoomDrillQuestion,
} from "metabase-lib/queries/drills/zoom-drill";
import { FieldDimension } from "metabase-lib/Dimension";
import { formatBucketing } from "metabase-lib/queries/utils/query-time";
import type { Drill } from "../../types";

const generateDrillTitle = (
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

const ZoomDrill: Drill = ({ question, clicked }) => {
  const result = getNextZoomDrilldown(question, clicked);

  if (!result) {
    return [];
  }

  const { dimensions, drilldown } = result;

  return [
    {
      name: "timeseries-zoom",
      title: generateDrillTitle(dimensions, drilldown),
      section: "zoom",
      icon: "zoom_in",
      buttonType: "horizontal",
      question: () => zoomDrillQuestion(question, dimensions, drilldown),
    },
  ];
};

export default ZoomDrill;
