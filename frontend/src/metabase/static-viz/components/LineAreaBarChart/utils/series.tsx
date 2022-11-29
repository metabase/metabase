import _ from "underscore";
import { merge } from "icepick";
import { isNotNull } from "metabase/core/utils/types";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { ColorPalette } from "metabase/lib/colors/types";
import {
  CardSeries,
  ChartSettings,
  Series,
  SeriesWithOneOrLessDimensions,
  SeriesWithTwoDimensions,
} from "../../XYChart/types";

export function getSeriesWithColors(
  settings: ChartSettings,
  palette: ColorPalette,
  multipleSeries: CardSeries[],
): (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][] {
  const isMultipleSeries = multipleSeries.length > 1;
  const keys = getSeriesKeys(multipleSeries, isMultipleSeries);

  const seriesSettings = settings.visualization_settings.series_settings;
  const seriesColors = seriesSettings
    ? _.mapObject(seriesSettings, value => {
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
  settings: ChartSettings,
  multipleSeries: CardSeries[],
): (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][] {
  const keys = getSeriesKeys(multipleSeries, multipleSeries.length > 1);
  const isMultipleSeries = multipleSeries.length > 1;

  const seriesSettings = settings.visualization_settings.series_settings;
  const seriesTitles = seriesSettings
    ? _.mapObject(seriesSettings, value => {
        return value.title;
      })
    : undefined;

  let index = -1;
  const legends = multipleSeries
    .flatMap(questionSeries => {
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
  multipleSeries: CardSeries[],
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

export function removeNoneSeriesFields(series: CardSeries): Series[] {
  return series.map(
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
