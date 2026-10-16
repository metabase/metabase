import { t } from "ttag";

import type { VisualizationSettings } from "metabase-types/api";

import {
  EXPLORE_CONVERSION_COLUMN,
  EXPLORE_PEOPLE_COLUMN,
} from "../sql/analyses/funnel-insights";

/** People as bars and conversion as a line, by each value in `segmentColumn`. */
export const getSegmentConversionVizSettings = (
  segmentColumn: string,
): VisualizationSettings => ({
  "graph.dimensions": [segmentColumn],
  "graph.metrics": [EXPLORE_PEOPLE_COLUMN, EXPLORE_CONVERSION_COLUMN],
  series_settings: {
    [EXPLORE_PEOPLE_COLUMN]: { display: "bar", title: t`People` },
    [EXPLORE_CONVERSION_COLUMN]: {
      display: "line",
      axis: "right",
      title: t`Conversion`,
    },
  },
  column_settings: {
    [JSON.stringify(["name", EXPLORE_CONVERSION_COLUMN])]: {
      number_style: "percent",
    },
  },
});
