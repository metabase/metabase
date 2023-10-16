import type { RawSeries } from "metabase-types/api";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { getCardSeriesModels } from "metabase/visualizations/echarts/cartesian/model/series";
import { getCartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { groupDataset } from "metabase/visualizations/echarts/cartesian/model/dataset";

export const getCartesianChartSeries = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) => {
  return rawSeries.map((cardDataset, index) => {
    // When multiple cards are combined on a dashboard card, computed visualization settings contain
    // dimensions and metrics settings of the first card only which is not correct.
    // Using the raw visualization settings for that is safe because we can combine
    // only saved cards that have these settings.
    const shouldUseIndividualCardSettings = rawSeries.length > 0;
    const columns = getCartesianChartColumns(
      cardDataset.data.cols,
      shouldUseIndividualCardSettings
        ? cardDataset.card.visualization_settings
        : settings,
    );

    const series = getCardSeriesModels(cardDataset, columns, index);

    return {
      columns,
      series,
    };
  });
};

export const getCartesianChartModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): CartesianChartModel => {
  return getCartesianChartSeries(rawSeries, settings).map(
    (chartSeriesModel, index) => {
      const { columns } = chartSeriesModel;
      const cardData = rawSeries[index].data;
      const breakoutIndex =
        "breakout" in columns ? columns.breakout.index : undefined;
      const dataset = groupDataset(
        cardData.rows,
        cardData.cols,
        columns.dimension.index,
        breakoutIndex,
      );

      return {
        ...chartSeriesModel,
        dataset,
      };
    },
  );
};
