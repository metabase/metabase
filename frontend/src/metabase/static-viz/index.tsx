import "./mock-environment";
import "fast-text-encoding";

import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";

// eslint-disable-next-line import/order
import enterpriseOverrides from "ee-overrides";
import "metabase/utils/dayjs";

import {
  StaticChoropleth,
  getStaticChoroplethSettings,
} from "metabase/static-viz/components/StaticChoropleth";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { LegacyStaticChart } from "metabase/static-viz/containers/LegacyStaticChart";
import type { LegacyStaticChartType } from "metabase/static-viz/containers/LegacyStaticChart/LegacyStaticChart";
import {
  type RenderChartOptions,
  applyRenderChartSettings,
  getRawSeriesWithDashcardSettings,
  initializeStaticVizContext,
  installStaticVizApi,
  registerCustomVizPlugin,
} from "metabase/static-viz/lib/entry-shared";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";
import { updateStartOfWeek } from "metabase/utils/i18n";
import { extractRemappings, isCartesianChart } from "metabase/visualizations";
// Deep imports (not the metabase/visualizer/utils barrel) so the static-viz
// bundle doesn't drag the visualizer's app-side dependencies in via the barrel.
import { createDataSource } from "metabase/visualizer/utils/data-source";
import { getVisualizationColumns } from "metabase/visualizer/utils/get-visualization-columns";
import { mergeVisualizerData } from "metabase/visualizer/utils/merge-data";
import {
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "metabase/visualizer/utils/split-series";
import type {
  Card,
  DashCardVisualizationSettings,
  Dataset,
  DatasetData,
  GeoJSONData,
  RawSeries,
  VisualizerDataSourceId,
  VisualizerVizDefinition,
} from "metabase-types/api";

installStaticVizApi();

setPlatformAPI({
  measureText: measureTextEChartsAdapter,
});

export type { RenderChartOptions };
export { registerCustomVizPlugin };

type RenderChartDashcardSettings = DashCardVisualizationSettings & {
  visualization?: VisualizerVizDefinition;
};

/**
 * @deprecated use RenderChart instead
 */
export function LegacyRenderChart(
  type: LegacyStaticChartType,
  options: unknown,
) {
  return ReactDOMServer.renderToStaticMarkup(
    <LegacyStaticChart type={type} options={options} />,
  );
}

function getVisualizerRawSeries(
  rawSeries: RawSeries,
  visualization: VisualizerVizDefinition,
  dataSources: ReturnType<typeof createDataSource>[],
): RawSeries {
  const { columnValuesMapping, display, settings } = visualization;

  const datasets = Object.fromEntries(
    rawSeries
      .filter((series) => series.card.id)
      .map((series) => [`card:${series.card.id}`, series]),
  ) as unknown as Record<VisualizerDataSourceId, Dataset | null | undefined>;

  const columns = getVisualizationColumns(visualization, datasets, dataSources);

  return [
    {
      card: {
        display,
        visualization_settings: settings,
      } as Card,
      data: mergeVisualizerData({
        columns,
        columnValuesMapping,
        datasets,
        dataSources,
      }) as DatasetData,
      columnValuesMapping,
    },
  ];
}

/**
 * Initialize the static viz context: set settings and apply enterprise overrides.
 * Must be called before registerCustomVizPlugin so that the EE registry is active.
 */
export function initializeContext(options: RenderChartOptions) {
  initializeStaticVizContext(options, enterpriseOverrides);
}

export function RenderChart(
  rawSeries: RawSeries,
  dashcardSettings: RenderChartDashcardSettings,
  options: RenderChartOptions,
) {
  applyRenderChartSettings(options, enterpriseOverrides);

  const renderingContext = createStaticRenderingContext(
    options.applicationColors,
  );

  let seriesForRender = rawSeries;
  if (dashcardSettings.visualization) {
    const { visualization } = dashcardSettings;
    const dataSources = rawSeries.map((series) =>
      createDataSource("card", series.card.id, series.card.name),
    );
    seriesForRender = getVisualizerRawSeries(
      rawSeries,
      visualization,
      dataSources,
    );
    const { display, columnValuesMapping } = visualization;
    if (
      display &&
      isCartesianChart(display) &&
      shouldSplitVisualizerSeries(columnValuesMapping)
    ) {
      const dataSourceNameMap = Object.fromEntries(
        dataSources.map((source) => [source.id, source.name]),
      );
      seriesForRender = splitVisualizerSeries(
        seriesForRender,
        columnValuesMapping,
        dataSourceNameMap,
      );
    }
  }

  updateStartOfWeek(options.startOfWeek);
  const rawSeriesWithDashcardSettings = getRawSeriesWithDashcardSettings(
    seriesForRender,
    dashcardSettings,
  );
  const rawSeriesWithRemappings = extractRemappings(
    rawSeriesWithDashcardSettings,
  );

  const hasDevWatermark = Boolean(options.tokenFeatures.development_mode);

  // Region (choropleth) maps render via a standalone SVG component rather than StaticVisualization,
  // because the "map" visualization isn't registered in the static-viz bundle (it depends on Leaflet).
  // The backend resolves the built-in GeoJSON and embeds it in dashcardSettings.
  if (rawSeriesWithRemappings[0].card.display === "map") {
    const extraSettings = dashcardSettings as Record<string, unknown>;
    const geoJson = extraSettings["map._geojson"] as GeoJSONData | undefined;
    const geoJsonDetails = extraSettings["map._geojson_details"] as
      | { region_key: string; region_name: string }
      | undefined;

    if (geoJson && geoJsonDetails) {
      return ReactDOMServer.renderToStaticMarkup(
        <StaticChoropleth
          rawSeries={rawSeriesWithRemappings}
          settings={getStaticChoroplethSettings(rawSeriesWithRemappings)}
          geoJson={geoJson}
          geoJsonDetails={geoJsonDetails}
          renderingContext={renderingContext}
        />,
      );
    }
  }

  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeriesWithRemappings}
      renderingContext={renderingContext}
      hasDevWatermark={hasDevWatermark}
      width={options.width}
      height={options.height}
      fitWithinBounds={options.fitWithinBounds}
    />,
  );
}
