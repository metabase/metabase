import _ from "underscore";
import { isNotNull } from "metabase/core/utils/types";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { formatStaticValue } from "metabase/static-viz/lib/format-static-value";
import { ColorPalette } from "metabase/lib/colors/types";
import {
  ChartSettings,
  Series,
  SeriesWithBreakoutValues,
  SeriesWithoutBreakoutValues,
} from "../../XYChart/types";

export function getSeriesWithColors(
  multipleSeries: (SeriesWithoutBreakoutValues | SeriesWithBreakoutValues)[],
  palette: ColorPalette,
  settings: ChartSettings,
): Series[] {
  const keys = multipleSeries
    .map(series => {
      if (hasBreakoutValues(series)) {
        return formatStaticValue(series.name, {
          column: series.column,
        });
      }

      return series.seriesKey;
    })
    .filter(isNotNull);
  const seriesColors = settings.series_settings
    ? _.mapObject(settings.series_settings, value => {
        return value.color;
      })
    : undefined;
  const chartColors = getColorsForValues(keys, seriesColors, palette);

  return multipleSeries.map((series, index) => {
    return {
      ...(_.omit(series, "column", "seriesKey") as Series),
      color: chartColors[keys[index]],
    };
  });
}

function hasBreakoutValues(
  series: SeriesWithBreakoutValues | SeriesWithoutBreakoutValues,
): series is SeriesWithBreakoutValues {
  return "column" in series;
}
