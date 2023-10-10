import _ from "underscore";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type {
  DatasetColumn,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import { getColorsForValues } from "metabase/lib/colors/charts";

import { normalize } from "metabase-lib/queries/utils/normalize";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { getIn } from "icepick";
import { buildCardModel } from "metabase/visualizations/shared/echarts/combo/data";

const getColors = (
  seriesVizSettingsKeys: string[],
  settings: VisualizationSettings,
) => {
  const assignments = _.chain(seriesVizSettingsKeys)
    .map(key => [key, getIn(settings, ["series_settings", key, "color"])])
    .filter(([key, color]) => color != null)
    .object()
    .value();

  const legacyColors = settings["graph.colors"];
  if (legacyColors) {
    for (const [index, key] of seriesVizSettingsKeys.entries()) {
      if (!(key in assignments)) {
        assignments[key] = legacyColors[index];
      }
    }
  }

  return getColorsForValues(seriesVizSettingsKeys, assignments);
};

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
  multipleSeries: RawSeries,
): ComputedVisualizationSettings => {
  const [{ card }] = multipleSeries;

  const settings: ComputedVisualizationSettings = {
    ...card.visualization_settings,
    column: (column: RemappingHydratedDatasetColumn) =>
      getColumnSettings(column, settings),
  };

  const cardModels = multipleSeries.map((series, index) => {
    return buildCardModel(series, settings, index);
  });

  const seriesDescriptors = cardModels.flatMap(
    model => model.cardSeries.yMultiSeries,
  );

  settings["series_settings.colors"] = getColors(
    seriesDescriptors.map(s => s.vizSettingsKey),
    settings,
  );

  return settings;
};
