import { t } from "ttag";

import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { getRadarChartColumns, getRadarData } from "./dataset";
import { getRadarFormatters } from "./formatters";
import type { RadarChartModel } from "./types";

export const getRadarChartModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): RadarChartModel => {
  const [
    {
      data: { cols },
    },
  ] = rawSeries;

  const radarColumns = getRadarChartColumns(cols, settings);
  if (!radarColumns) {
    throw new Error(t`Columns selection is invalid`);
  }
  
  const formatters = getRadarFormatters(radarColumns, settings);
  const data = getRadarData(rawSeries, radarColumns);

  return {
    data,
    formatters,
    radarColumns,
  };
};