import type { RawSeries } from "metabase-types/api";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  AxisSplit,
  CartesianChartModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  getCardSeriesModels,
  getDimensionModel,
} from "metabase/visualizations/echarts/cartesian/model/series";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getCartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import {
  getJoinedCardsDataset,
  getNormalizedDataset,
  getNullReplacerFunction,
  getSortedSeriesModels,
  replaceValues,
} from "metabase/visualizations/echarts/cartesian/model/dataset";

export const getCardsColumns = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) => {
  return rawSeries.map(({ data, card }) => {
    // When multiple cards are combined on a dashboard card, computed visualization settings contain
    // dimensions and metrics settings of the first card only which is not correct.
    // Using the raw visualization settings for that is safe because we can combine
    // only saved cards that have these settings.
    const shouldUseIndividualCardSettings = rawSeries.length > 0;
    return getCartesianChartColumns(
      data.cols,
      shouldUseIndividualCardSettings ? card.visualization_settings : settings,
    );
  });
};

export const getCardsSeriesModels = (
  rawSeries: RawSeries,
  cardsColumns: CartesianChartColumns[],
  renderingContext: RenderingContext,
) => {
  return rawSeries.flatMap((cardDataset, index) => {
    const isFirstCard = index === 0;
    const cardColumns = cardsColumns[index];

    return getCardSeriesModels(
      cardDataset,
      cardColumns,
      isFirstCard,
      renderingContext,
    );
  });
};

export const getCartesianChartModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): CartesianChartModel => {
  const cardsColumns = getCardsColumns(rawSeries, settings);

  const dimensionModel = getDimensionModel(rawSeries, cardsColumns);
  const unsortedSeriesModels = getCardsSeriesModels(
    rawSeries,
    cardsColumns,
    renderingContext,
  );
  const seriesModels = getSortedSeriesModels(unsortedSeriesModels, settings);

  const seriesDataKeys = seriesModels.map(seriesModel => seriesModel.dataKey);
  const dataset = replaceValues(
    getJoinedCardsDataset(rawSeries, cardsColumns),
    getNullReplacerFunction(settings, seriesModels),
  );

  const normalizedDataset = getNormalizedDataset(
    dataset,
    seriesDataKeys,
    dimensionModel.dataKey,
  );

  const yAxisSplit: AxisSplit = [seriesDataKeys, []];

  const [leftSeriesDataKeys, rightSeriesDataKeys] = yAxisSplit;
  const leftAxisColumn = seriesModels.find(
    seriesModel => seriesModel.dataKey === leftSeriesDataKeys[0],
  )?.column;
  const rightAxisColumn = seriesModels.find(
    seriesModel => seriesModel.dataKey === rightSeriesDataKeys[0],
  )?.column;

  return {
    dataset,
    normalizedDataset,
    seriesModels,
    dimensionModel,
    yAxisSplit,
    leftAxisColumn,
    rightAxisColumn,
  };
};
