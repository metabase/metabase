import { t } from "ttag";

import {
  getCartesianChartColumns,
  hasValidColumnsSelected,
} from "metabase/visualizations/lib/graph/columns";
import { GRAPH_DATA_SETTINGS } from "metabase/visualizations/lib/settings/graph";
import {
  getBreakoutCardinality,
  validateBreakoutSeriesCount,
  validateChartDataSettings,
  validateDatasetRows,
  validateStacking,
} from "metabase/visualizations/lib/settings/validation";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import { getSeries } from "metabase/visualizations/shared/utils/data";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  DatasetData,
  TransformedCard,
  VisualizationSettings,
} from "metabase-types/api";

import { getColumnValueFormatter } from "./utils/format";
import { ROW_CHART_SETTINGS } from "./utils/settings-definitions";

export const ROW_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Row`,
  identifier: "row",
  iconName: "horizontal_bar",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`row chart`,
  noHeader: true,
  hasEmptyState: true,
  minSize: getMinSize("row"),
  defaultSize: getDefaultSize("row"),
  settings: {
    ...ROW_CHART_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
    ["graph.metrics"]: {
      ...GRAPH_DATA_SETTINGS["graph.metrics"],
      get title() {
        return t`X-axis`;
      },
    },
    ["graph.dimensions"]: {
      ...GRAPH_DATA_SETTINGS["graph.dimensions"],
      get title() {
        return t`Y-axis`;
      },
    },
  },
  isSensible: ({ cols, rows }: DatasetData) => {
    return (
      rows.length > 1 &&
      cols.length >= 2 &&
      cols.filter(isDimension).length > 0 &&
      cols.filter(isMetric).length > 0
    );
  },
  isLiveResizable: (series: any[]) => {
    const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
    return totalRows < 10;
  },
  /**
   * Required to make it compatible with series settings without rewriting them fully
   * It expands a single card + dataset into multiple "series" and sets _seriesKey which is needed for settings to work
   */
  transformSeries: (originalMultipleSeries) => {
    const [series] = originalMultipleSeries;
    const settings: ComputedVisualizationSettings =
      getComputedSettingsForSeries(originalMultipleSeries);
    const { card, data } = series;

    if (isTransformedCard(card) || !hasValidColumnsSelected(settings, data)) {
      return originalMultipleSeries;
    }

    const cardinality = getBreakoutCardinality(data.cols, data.rows, settings);
    if (cardinality != null && cardinality > MAX_SERIES) {
      return originalMultipleSeries;
    }

    const chartColumns = getCartesianChartColumns(data.cols, settings);
    const seriesDefinitions = getSeries(
      data,
      chartColumns,
      getColumnValueFormatter(),
      settings,
    );

    const transformedSeries = seriesDefinitions.map((seriesDef) => ({
      card: {
        ...card,
        name: seriesDef.seriesName,
        _seriesKey: seriesDef.seriesKey,
        _transformed: true,
      },
      data: {
        ...data,
        cols: [
          seriesDef.seriesInfo?.dimensionColumn,
          seriesDef.seriesInfo?.metricColumn,
        ].filter((column) => column != null),
      },
    }));

    return transformedSeries.length > 0
      ? transformedSeries
      : originalMultipleSeries;
  },
  checkRenderable: (series: any[], settings: VisualizationSettings) => {
    validateDatasetRows(series);
    validateBreakoutSeriesCount(series, settings);
    validateChartDataSettings(settings);
    validateStacking(settings);
  },
};

function isTransformedCard(card: Card): card is TransformedCard {
  return "_transformed" in card && card._transformed === true;
}
