import { c, t } from "ttag";

import * as Lib from "metabase-lib";
import type { VisualizationSettings } from "metabase-types/api";

import {
  getAxisTitleSettings,
  getConversionColumnSettings,
  getSeriesSettings,
} from "../analyses/series-settings";
import type { AnalysisSpec, OutputSpec, Period } from "../spec/types";
import { periodOf } from "../sql/analyses/cohorts";

/** How the retention curves are drawn, once hidden settings are resolved. */
export type RetentionCurvesView = {
  period: Period;
  isPercent: boolean;
  lines: NonNullable<OutputSpec["cohortsLines"]>;
  xAxis: "sinceStart" | "date";
};

const getDimensions = ({ lines, xAxis }: RetentionCurvesView): string[] => {
  if (lines === "average") {
    return ["offset"];
  }
  return xAxis === "date" ? ["date", "cohort"] : ["offset", "cohort"];
};

/**
 * The cohorts query's result as a line chart: a line per cohort, or one for
 * all of them, over the periods since each start or the calendar. Counts by
 * date are stacked, so the chart shows active people per period by cohort.
 */
export const getRetentionCurvesSettings = (
  view: RetentionCurvesView,
): VisualizationSettings => {
  const isByDate = view.xAxis === "date";
  const y = view.isPercent ? t`Retained` : t`Retained people`;
  return {
    "graph.dimensions": getDimensions(view),
    "graph.metrics": ["value"],
    "graph.x_axis.scale": isByDate ? "timeseries" : "ordinal",
    ...(isByDate && !view.isPercent
      ? { "stackable.stack_type": "stacked" }
      : {}),
    ...(view.lines === "average"
      ? getSeriesSettings("value", t`All cohorts`)
      : {}),
    ...getAxisTitleSettings({
      x: isByDate
        ? Lib.describeTemporalUnit(view.period)
        : c("{0} is a plural time unit, e.g. Weeks")
            .t`${Lib.describeTemporalUnit(view.period, 2)} since start`,
      y,
    }),
    ...(view.isPercent ? getConversionColumnSettings("value") : {}),
  };
};

/** The cohort table: a row per cohort and a column per period since the start. */
export const getCohortTableSettings = (
  spec: AnalysisSpec,
): VisualizationSettings => ({
  "cohort.period": periodOf(spec),
  "cohort.value_format": spec.output.cohortsDisplay ?? "percent",
});
