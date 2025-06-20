import _ from "underscore";

import { isCartesianChart } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import {
  createDataSource,
  isVisualizerDashboardCard,
  mergeVisualizerData,
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "metabase/visualizer/utils";
import { getVisualizationColumns } from "metabase/visualizer/utils/get-visualization-columns";
import type {
  Card,
  DashCardDataMap,
  DashCardId,
  DashboardCard,
  Dataset,
  DatasetData,
  Series,
} from "metabase-types/api";
import type {
  RawSeries,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

export const getSeriesForDashcard = ({
  dashcard,
  rawSeries,
  datasets,
}: {
  dashcard: DashboardCard;
  rawSeries: Series;
  datasets: DashCardDataMap[DashCardId];
}) => {
  if (
    !dashcard ||
    !rawSeries ||
    rawSeries.length === 0 ||
    !isVisualizerDashboardCard(dashcard)
  ) {
    return { card: undefined, series: rawSeries };
  }

  const visualizerEntity = dashcard.visualization_settings.visualization;
  const { display, columnValuesMapping, settings } = visualizerEntity;

  const cards = [dashcard.card];
  if (Array.isArray(dashcard.series)) {
    cards.push(...dashcard.series);
  }

  const dataSources = cards.map((card) =>
    createDataSource("card", card.id, card.name),
  );

  const dataSourceDatasets: Record<
    VisualizerDataSourceId,
    Dataset | null | undefined
  > = Object.fromEntries(
    Object.entries(datasets ?? {}).map(([cardId, dataset]) => [
      `card:${cardId}`,
      dataset,
    ]),
  );

  const didEveryDatasetLoad = dataSources.every(
    (dataSource) => dataSourceDatasets[dataSource.id] != null,
  );

  const columns = getVisualizationColumns(
    visualizerEntity,
    dataSourceDatasets,
    dataSources,
  );
  const card = extendCardWithDashcardSettings(
    {
      display,
      name: settings["card.title"],
      visualization_settings: settings,
    } as Card,
    _.omit(dashcard.visualization_settings, "visualization"),
  ) as Card;

  if (!didEveryDatasetLoad) {
    return { card, series: [{ card }] };
  }

  const series: RawSeries = [
    {
      card: extendCardWithDashcardSettings(
        {
          display,
          name: settings["card.title"],
          visualization_settings: settings,
        } as Card,
        _.omit(dashcard.visualization_settings, "visualization"),
      ) as Card,

      data: mergeVisualizerData({
        columns,
        columnValuesMapping,
        datasets: dataSourceDatasets,
        dataSources,
      }) as DatasetData,

      // Certain visualizations memoize settings computation based on series keys
      // This guarantees a visualization always rerenders on changes
      started_at: new Date().toISOString(),
    },
  ];

  if (
    display &&
    isCartesianChart(display) &&
    shouldSplitVisualizerSeries(columnValuesMapping)
  ) {
    const dataSourceNameMap = Object.fromEntries(
      dataSources.map((dataSource) => [dataSource.id, dataSource.name]),
    );
    return {
      card,
      series: splitVisualizerSeries(
        series,
        columnValuesMapping,
        dataSourceNameMap,
      ),
    };
  }

  return { card, series };
};
