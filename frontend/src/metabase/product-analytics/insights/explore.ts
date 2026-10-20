import type {
  DatasetColumn,
  DatasetData,
  DatasetQuery,
  UnsavedCard,
} from "metabase-types/api";

import {
  CONVERSION_COLUMN_FORMAT,
  getSeriesSettings,
} from "../analyses/series-settings";
import { SEGMENT_SEPARATOR } from "../sql/analyses/insights";

import { describeValue } from "./describe";
import type { InsightOutcome } from "./outcomes";
import type { InsightSegment } from "./segments";
import type { InsightAttribute } from "./types";

/** The explore query's segment column: the attribute names, joined. */
export const getExploreSegmentLabel = (
  attributes: readonly Pick<InsightAttribute, "displayName">[],
): string =>
  attributes.map(({ displayName }) => displayName).join(SEGMENT_SEPARATOR);

const columnKey = (name: string) => JSON.stringify(["name", name]);

/**
 * An unsaved question for the query builder: the outcome rate as bars, by each
 * value of the insight's attributes, with each segment's size in the tooltip.
 */
export const getExploreCard = (
  datasetQuery: DatasetQuery,
  attributes: readonly Pick<InsightAttribute, "displayName">[],
  { explore }: InsightOutcome,
): UnsavedCard => ({
  display: "bar",
  dataset_query: datasetQuery,
  visualization_settings: {
    "graph.dimensions": [getExploreSegmentLabel(attributes)],
    "graph.metrics": [explore.rateColumn],
    "graph.tooltip_columns": [columnKey(explore.countColumn)],
    ...getSeriesSettings(explore.rateColumn, explore.rateTitle),
    column_settings: {
      [columnKey(explore.rateColumn)]: CONVERSION_COLUMN_FORMAT,
      [columnKey(explore.countColumn)]: { column_title: explore.countTitle },
    },
  },
});

const describeSegment = (
  { label, values }: InsightSegment,
  attributes: readonly InsightAttribute[],
) =>
  values.length > 0
    ? values
        .map((value, index) => describeValue(attributes[index], value))
        .join(SEGMENT_SEPARATOR)
    : label;

/**
 * What the explore query returns for these segments, so the explore chart can
 * be drawn from counts already fetched. Values are labeled for reading, like
 * "Anonymous" for a person who hasn't been identified.
 */
export const getExploreData = (
  segments: readonly InsightSegment[],
  attributes: readonly InsightAttribute[],
  sql: string,
  { explore }: InsightOutcome,
): DatasetData => {
  const segmentLabel = getExploreSegmentLabel(attributes);
  const cols: DatasetColumn[] = [
    {
      name: segmentLabel,
      display_name: segmentLabel,
      source: "native",
      base_type: "type/Text",
    },
    {
      name: explore.countColumn,
      display_name: explore.countTitle,
      source: "native",
      base_type: "type/Integer",
    },
    {
      name: explore.rateColumn,
      display_name: explore.rateTitle,
      source: "native",
      base_type: "type/Float",
    },
  ];
  return {
    cols,
    rows: segments.map((segment) => [
      describeSegment(segment, attributes),
      segment.reached,
      segment.rate,
    ]),
    native_form: { query: sql },
    rows_truncated: 0,
    results_metadata: { columns: [] },
  };
};
