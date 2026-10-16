import { c, t } from "ttag";

import { isFuturePeriod } from "metabase/visualizations/visualizations/CohortTable/utils";
import * as Lib from "metabase-lib";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import { getConversionColumnSettings } from "../analyses/series-settings";
import type { AnalysisSpec, Period } from "../spec/types";
import { periodOf } from "../sql/analyses/cohorts";

/**
 * The cohort query's rows without the periods a cohort hasn't reached yet.
 * The query emits every offset up to the horizon, so without this each line
 * would fall to zero at the end instead of stopping.
 */
export const getRetentionCurvesData = (
  data: DatasetData,
  period: Period,
): DatasetData => {
  const cohortIndex = data.cols.findIndex(({ name }) => name === "cohort");
  const offsetIndex = data.cols.findIndex(({ name }) => name === "offset");
  if (cohortIndex < 0 || offsetIndex < 0) {
    return data;
  }
  return {
    ...data,
    rows: data.rows.filter(
      (row) =>
        !isFuturePeriod(
          String(row[cohortIndex] ?? ""),
          Number(row[offsetIndex]),
          period,
        ),
    ),
  };
};

/** A line per cohort, with a tick per period since the cohort started. */
export const getRetentionCurvesSettings = (
  spec: AnalysisSpec,
): VisualizationSettings => {
  const units = Lib.describeTemporalUnit(periodOf(spec), 2);
  const isPercent = spec.output.cohortsDisplay !== "counts";
  return {
    "graph.dimensions": ["offset", "cohort"],
    "graph.metrics": ["value"],
    "graph.x_axis.scale": "ordinal",
    "graph.x_axis.title_text": c("{0} is a plural time unit, e.g. Weeks")
      .t`${units} since start`,
    "graph.y_axis.title_text": isPercent ? t`Retained` : t`Retained people`,
    ...(isPercent ? getConversionColumnSettings("value") : {}),
  };
};
