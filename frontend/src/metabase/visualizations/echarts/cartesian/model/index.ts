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
  getDatasetExtents,
  getJoinedCardsDataset,
  getSortedSeriesModels,
  getTransformedDataset,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import {
  getYAxesExtents,
  getYAxisSplit,
} from "metabase/visualizations/echarts/cartesian/model/axis";

const SUPPORTED_AUTO_SPLIT_TYPES = ["line", "area", "bar", "combo"];

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
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  const hasMultipleCards = rawSeries.length > 1;
  return rawSeries.flatMap((cardDataset, index) => {
    const isFirstCard = index === 0;
    const cardColumns = cardsColumns[index];

    return getCardSeriesModels(
      cardDataset,
      cardColumns,
      isFirstCard,
      hasMultipleCards,
      settings,
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
    settings,
    renderingContext,
  );
  const seriesModels = getSortedSeriesModels(unsortedSeriesModels, settings);

  const seriesDataKeys = seriesModels.map(seriesModel => seriesModel.dataKey);
  const dataset = getJoinedCardsDataset(rawSeries, cardsColumns);
  const transformedDataset = getTransformedDataset(
    dataset,
    seriesModels,
    settings,
    dimensionModel,
  );

  const extents = getDatasetExtents(seriesDataKeys, dataset);
  const isAutoSplitSupported = SUPPORTED_AUTO_SPLIT_TYPES.includes(
    rawSeries[0].card.display,
  );

  const yAxisSplit: AxisSplit = getYAxisSplit(
    seriesModels,
    extents,
    settings,
    isAutoSplitSupported,
  );
  const yAxisExtents = getYAxesExtents(yAxisSplit, dataset, settings);

  const [leftSeriesDataKeys, rightSeriesDataKeys] = yAxisSplit;
  const leftAxisColumn = seriesModels.find(
    seriesModel => seriesModel.dataKey === leftSeriesDataKeys[0],
  )?.column;
  const rightAxisColumn = seriesModels.find(
    seriesModel => seriesModel.dataKey === rightSeriesDataKeys[0],
  )?.column;

  return {
    dataset,
    transformedDataset,
    seriesModels,
    dimensionModel,
    yAxisSplit,
    leftAxisColumn,
    rightAxisColumn,
    yAxisExtents,
  };
};
