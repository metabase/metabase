import type {
  DatasetColumn,
  DatasetData,
  DatasetQuery,
  UnsavedCard,
} from "metabase-types/api";

import {
  BASELINE_COLOR_NAME,
  CONVERSION_COLUMN_FORMAT,
  getAxisTitleSettings,
  getSeriesSettings,
} from "../analyses/series-settings";
import { SEGMENT_SEPARATOR } from "../sql/analyses/insights";

import { describeValue } from "./describe";
import type { InsightOutcome } from "./outcomes";
import { type InsightSegment, getExpectedRate } from "./segments";
import type { InsightAttribute } from "./types";

/** The explore query's segment column: the attribute names, joined. */
export const getExploreSegmentLabel = (
  attributes: readonly Pick<InsightAttribute, "displayName">[],
): string =>
  attributes.map(({ displayName }) => displayName).join(SEGMENT_SEPARATOR);

const columnKey = (name: string) => JSON.stringify(["name", name]);

/** The expected rate's column and title, when the outcome has one. */
const expectedRateOf = ({
  explore,
}: InsightOutcome): { column: string; title: string } | undefined =>
  explore.expectedRateColumn !== undefined &&
  explore.expectedRateTitle !== undefined
    ? { column: explore.expectedRateColumn, title: explore.expectedRateTitle }
    : undefined;

/**
 * An unsaved question for the query builder: the outcome rate as bars, by each
 * value of the insight's attributes, with each segment's size in the tooltip.
 * When the outcome has an expected rate, it's a gray bar beside each.
 */
export const getExploreCard = (
  datasetQuery: DatasetQuery,
  attributes: readonly Pick<InsightAttribute, "displayName">[],
  outcome: InsightOutcome,
): UnsavedCard => {
  const { explore } = outcome;
  const expected = expectedRateOf(outcome);
  return {
    display: "bar",
    dataset_query: datasetQuery,
    visualization_settings: {
      "graph.dimensions": [getExploreSegmentLabel(attributes)],
      "graph.metrics": [
        explore.rateColumn,
        ...(expected !== undefined ? [expected.column] : []),
      ],
      "graph.tooltip_columns": [columnKey(explore.countColumn)],
      series_settings: {
        ...getSeriesSettings(explore.rateColumn, explore.rateTitle)
          .series_settings,
        ...(expected !== undefined
          ? getSeriesSettings(
              expected.column,
              expected.title,
              BASELINE_COLOR_NAME,
            ).series_settings
          : {}),
      },
      ...getAxisTitleSettings({ y: explore.rateTitle }),
      column_settings: {
        [columnKey(explore.rateColumn)]: CONVERSION_COLUMN_FORMAT,
        ...(expected !== undefined
          ? { [columnKey(expected.column)]: CONVERSION_COLUMN_FORMAT }
          : {}),
        [columnKey(explore.countColumn)]: { column_title: explore.countTitle },
      },
    },
  };
};

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
  outcome: InsightOutcome,
): DatasetData => {
  const { explore } = outcome;
  const expected = expectedRateOf(outcome);
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
    ...(expected !== undefined
      ? [
          {
            name: expected.column,
            display_name: expected.title,
            source: "native",
            base_type: "type/Float",
          },
        ]
      : []),
  ];
  return {
    cols,
    rows: segments.map((segment) => [
      describeSegment(segment, attributes),
      segment.reached,
      segment.rate,
      ...(expected !== undefined ? [getExpectedRate(segment) ?? null] : []),
    ]),
    native_form: { query: sql },
    rows_truncated: 0,
    results_metadata: { columns: [] },
  };
};
