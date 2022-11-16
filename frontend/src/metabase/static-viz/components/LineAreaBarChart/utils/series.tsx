import _ from "underscore";
import { merge } from "icepick";
import { isNotNull } from "metabase/core/utils/types";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { ColorPalette } from "metabase/lib/colors/types";
import {
  ChartSettings,
  Series,
  SeriesWithOneOrLessDimensions,
  SeriesWithTwoDimensions,
} from "../../XYChart/types";

export function getSeriesWithColors(
  multipleSeries: (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][],
  multipleSetting: ChartSettings,
  palette: ColorPalette,
): (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[] {
  const isMultipleSeries = multipleSeries.length > 1;
  const keys = multipleSeries
    .flatMap((questionSeries, seriesIndex) => {
      return questionSeries.map(series => {
        if (!hasTwoDimensions(series)) {
          // One or zero dimensions
          if (seriesIndex === 0) {
            return series.column.name;
          }

          const hasOneMetric = questionSeries.length === 1;
          if (!isMultipleSeries || hasOneMetric) {
            return series.cardName;
          }

          // is multiple series card
          return `${series.cardName}: ${series.column.display_name}`;
        }

        const columnKey = formatStaticValue(series.breakoutValue, {
          column: series.column,
        });

        if (!isMultipleSeries) {
          return columnKey;
        }

        // is multiple series card
        return `${series.cardName}: ${columnKey}`;
      });
    })
    .filter(isNotNull);

  const seriesColors = multipleSetting.series_settings
    ? _.mapObject(multipleSetting.series_settings, value => {
        return value.color;
      })
    : undefined;
  const chartColors = getColorsForValues(keys, seriesColors, palette);

  return multipleSeries
    .flatMap(questionSeries => questionSeries)
    .map((series, index) => {
      return merge(series, {
        color: chartColors[keys[index]],
      });
    });
}

function hasTwoDimensions(
  series: SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions,
): series is SeriesWithTwoDimensions {
  return "breakoutValue" in series;
}

export function removeNoneSeriesFields(
  series: (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[],
): Series[] {
  return series.map(
    series => _.omit(series, "cardName", "column", "breakoutValue") as Series,
  );
}
