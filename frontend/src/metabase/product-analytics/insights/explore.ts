import { t } from "ttag";

import type {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";

import {
  CONVERSION_COLUMN_FORMAT,
  getSeriesSettings,
} from "../analyses/series-settings";
import {
  EXPLORE_CONVERSION_COLUMN,
  EXPLORE_PEOPLE_COLUMN,
  SEGMENT_SEPARATOR,
} from "../sql/analyses/funnel-insights";

import type { InsightSegment } from "./segments";
import type { InsightAttribute } from "./types";

/** The explore query's segment column: the attribute names, joined. */
export const getExploreSegmentLabel = (
  attributes: readonly Pick<InsightAttribute, "displayName">[],
): string =>
  attributes.map(({ displayName }) => displayName).join(SEGMENT_SEPARATOR);

const columnKey = (name: string) => JSON.stringify(["name", name]);

/** Conversion as bars, by each value in `segmentColumn`, with people in the tooltip. */
export const getSegmentConversionVizSettings = (
  segmentColumn: string,
): VisualizationSettings => ({
  "graph.dimensions": [segmentColumn],
  "graph.metrics": [EXPLORE_CONVERSION_COLUMN],
  "graph.tooltip_columns": [columnKey(EXPLORE_PEOPLE_COLUMN)],
  ...getSeriesSettings(EXPLORE_CONVERSION_COLUMN, t`Conversion`),
  column_settings: {
    [columnKey(EXPLORE_CONVERSION_COLUMN)]: CONVERSION_COLUMN_FORMAT,
    [columnKey(EXPLORE_PEOPLE_COLUMN)]: { column_title: t`People` },
  },
});

/**
 * What the explore query returns for these segments, so the explore chart can
 * be drawn from counts already fetched.
 */
export const getExploreData = (
  segments: readonly InsightSegment[],
  segmentLabel: string,
  sql: string,
): DatasetData => {
  const cols: DatasetColumn[] = [
    {
      name: segmentLabel,
      display_name: segmentLabel,
      source: "native",
      base_type: "type/Text",
    },
    {
      name: EXPLORE_PEOPLE_COLUMN,
      display_name: t`People`,
      source: "native",
      base_type: "type/Integer",
    },
    {
      name: EXPLORE_CONVERSION_COLUMN,
      display_name: t`Conversion`,
      source: "native",
      base_type: "type/Float",
    },
  ];
  return {
    cols,
    rows: segments.map(({ label, reached, rate }) => [label, reached, rate]),
    native_form: { query: sql },
    rows_truncated: 0,
    results_metadata: { columns: [] },
  };
};
