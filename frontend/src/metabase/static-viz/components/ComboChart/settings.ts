import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  DatasetColumn,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { getSeriesColors } from "metabase/visualizations/shared/settings/series";
import { getSeriesVizSettingsKey } from "metabase/visualizations/echarts/cartesian/option/series";
import { getCartesianChartSeries } from "metabase/visualizations/echarts/cartesian/model";
import { normalize } from "metabase-lib/queries/utils/normalize";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";

const getColumnSettings = (
  column: DatasetColumn,
  settings: VisualizationSettings,
) => {
  const columnKey = Object.keys(settings.column_settings ?? {}).find(
    possiblyDenormalizedFieldRef =>
      normalize(possiblyDenormalizedFieldRef) === getColumnKey(column),
  );

  if (!columnKey) {
    return null;
  }

  return settings.column_settings?.[columnKey];
};

// should be in sync with the dynamic chart settings definitions logic
export const computeStaticComboChartSettings = (
  rawSeries: RawSeries,
  renderingContext: RenderingContext,
): ComputedVisualizationSettings => {
  const [{ card }] = rawSeries;

  const settings: ComputedVisualizationSettings = {
    ...card.visualization_settings,
    column: (column: RemappingHydratedDatasetColumn) =>
      getColumnSettings(column, settings),
  };

  const cardSeriesModels = getCartesianChartSeries(rawSeries, settings);
  const seriesVizSettingsKeys = cardSeriesModels.flatMap(cardSeriesModel =>
    cardSeriesModel.series.metrics.map(seriesModel =>
      getSeriesVizSettingsKey(seriesModel, renderingContext.formatValue),
    ),
  );

  settings["series_settings.colors"] = getSeriesColors(
    seriesVizSettingsKeys,
    settings,
  );

  // TODO: compute series settings
  return settings;
};
