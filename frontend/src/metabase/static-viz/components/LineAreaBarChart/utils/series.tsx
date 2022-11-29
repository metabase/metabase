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
  settings: ChartSettings,
  palette: ColorPalette,
): (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][] {
  const isMultipleSeries = multipleSeries.length > 1;
  const keys = getSeriesKeys(multipleSeries, isMultipleSeries);

  const seriesColors = settings.series_settings
    ? _.mapObject(settings.series_settings, value => {
        return value.color;
      })
    : undefined;
  const chartColors = getColorsForValues(
    keys,
    removeEmptyValues(seriesColors),
    palette,
  );

  let index = -1;
  return multipleSeries.map(questionSeries =>
    questionSeries.map(series => {
      index++;

      return merge(series, {
        color: chartColors[keys[index]],
      });
    }),
  );
}

export function getSeriesWithLegends(
  multipleSeries: (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][],
  settings: ChartSettings,
): (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][] {
  const keys = getSeriesKeys(multipleSeries, multipleSeries.length > 1);
  const isMultipleSeries = multipleSeries.length > 1;

  const seriesTitles = settings.series_settings
    ? _.mapObject(settings.series_settings, value => {
        return value.title;
      })
    : undefined;

  let index = -1;
  const legends = multipleSeries
    .flatMap((questionSeries, seriesIndex) => {
      return questionSeries.map(series => {
        index++;

        const customSeriesTitle = seriesTitles?.[keys[index]];
        if (customSeriesTitle) {
          return customSeriesTitle;
        }

        // When rendering multiple scalars `column` would be null.
        if (series.column == null) {
          return series.cardName;
        }

        if (!hasTwoDimensions(series)) {
          // One or zero dimensions

          if (seriesIndex === 0 && series.name) {
            return series.name;
          }

          const hasOneMetric = questionSeries.length === 1;
          if (hasOneMetric) {
            return series.cardName;
          }

          if (!isMultipleSeries) {
            return series.column.display_name;
          }

          // is multiple series card
          return `${series.cardName}: ${series.column.display_name}`;
        } else {
          // Two dimensions

          const columnKey = formatStaticValue(series.breakoutValue, {
            column: series.column,
          });

          if (!isMultipleSeries) {
            return columnKey;
          }

          // is multiple series card
          return `${series.cardName}: ${columnKey}`;
        }
      });
    })
    .filter(isNotNull);

  index = -1;
  return multipleSeries.map(questionSeries =>
    questionSeries.map(series => {
      index++;

      return merge(series, {
        name: legends[index],
      });
    }),
  );
}

function getSeriesKeys(
  multipleSeries: (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][],
  isMultipleSeries: boolean,
) {
  return multipleSeries
    .flatMap((questionSeries, seriesIndex) => {
      return questionSeries.map(series => {
        // When rendering multiple scalars `column` would be null.
        if (series.column == null) {
          return series.cardName;
        }

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
        } else {
          // Two dimension
          const columnKey = formatStaticValue(series.breakoutValue, {
            column: series.column,
          });

          if (!isMultipleSeries) {
            return columnKey;
          }

          // is multiple series card
          return `${series.cardName}: ${columnKey}`;
        }
      });
    })
    .filter(isNotNull);
}

function hasTwoDimensions(
  series: SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions,
): series is SeriesWithTwoDimensions {
  return "breakoutValue" in series;
}

export function removeNoneSeriesFields(
  series: (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][],
): Series[] {
  return series
    .flat()
    .map(
      series => _.omit(series, "cardName", "column", "breakoutValue") as Series,
    );
}

function removeEmptyValues(
  seriesColors: { [x: string]: string | undefined } | undefined,
): Record<string, string> | undefined {
  if (seriesColors) {
    return Object.fromEntries(
      Object.entries(seriesColors).filter(([key, value]) => isNotNull(value)),
    ) as unknown as Record<string, string>;
  }
}
