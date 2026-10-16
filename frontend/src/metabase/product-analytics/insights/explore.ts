import { t } from "ttag";

import type {
  DatasetQuery,
  UnsavedCard,
  VisualizationSettings,
} from "metabase-types/api";

import {
  EXPLORE_CONVERSION_COLUMN,
  EXPLORE_PEOPLE_COLUMN,
} from "../sql/analyses/funnel-insights";

import type { InsightAttribute } from "./types";

/** The explore query's segment column: the attribute names, joined. */
export const getExploreSegmentLabel = (
  attributes: readonly Pick<InsightAttribute, "displayName">[],
): string => attributes.map(({ displayName }) => displayName).join(" · ");

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

/**
 * An unsaved question for the query builder: people as bars and conversion
 * as a line, by each value of the insight's attributes.
 */
export const getExploreCard = (
  datasetQuery: DatasetQuery,
  attributes: readonly Pick<InsightAttribute, "displayName">[],
): UnsavedCard => ({
  display: "combo",
  dataset_query: datasetQuery,
  visualization_settings: getSegmentConversionVizSettings(
    getExploreSegmentLabel(attributes),
  ),
});
