import { t } from "ttag";

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
import {
  EXPLORE_CONVERSION_COLUMN,
  EXPLORE_PEOPLE_COLUMN,
  SEGMENT_SEPARATOR,
} from "../sql/analyses/funnel-insights";

import { describeValue } from "./describe";
import type { InsightSegment } from "./segments";
import type { InsightAttribute } from "./types";

/** The explore query's segment column: the attribute names, joined. */
export const getExploreSegmentLabel = (
  attributes: readonly Pick<InsightAttribute, "displayName">[],
): string =>
  attributes.map(({ displayName }) => displayName).join(SEGMENT_SEPARATOR);

const columnKey = (name: string) => JSON.stringify(["name", name]);

/**
 * An unsaved question for the query builder: conversion as bars, by each value
 * of the insight's attributes, with people in the tooltip.
 */
export const getExploreCard = (
  datasetQuery: DatasetQuery,
  attributes: readonly Pick<InsightAttribute, "displayName">[],
): UnsavedCard => ({
  display: "bar",
  dataset_query: datasetQuery,
  visualization_settings: {
    "graph.dimensions": [getExploreSegmentLabel(attributes)],
    "graph.metrics": [EXPLORE_CONVERSION_COLUMN],
    "graph.tooltip_columns": [columnKey(EXPLORE_PEOPLE_COLUMN)],
    ...getSeriesSettings(EXPLORE_CONVERSION_COLUMN, t`Conversion`),
    column_settings: {
      [columnKey(EXPLORE_CONVERSION_COLUMN)]: CONVERSION_COLUMN_FORMAT,
      [columnKey(EXPLORE_PEOPLE_COLUMN)]: { column_title: t`People` },
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
