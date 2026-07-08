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
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";
import type { ColorPalette } from "metabase/ui/colors/types";
import { updateStartOfWeek } from "metabase/utils/i18n";
import MetabaseSettings from "metabase/utils/settings";
import { extractRemappings, isCartesianChart } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import {
  createDataSource,
  getVisualizationColumns,
  mergeVisualizerData,
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "metabase/visualizer/utils";
import type {
  Card,
  DashCardVisualizationSettings,
  Dataset,
  DatasetData,
  DayOfWeekId,
  FormattingSettings,
  GeoJSONData,
  RawSeries,
  SettingKey,
  TokenFeatures,
  VisualizerDataSourceId,
  VisualizerVizDefinition,
} from "metabase-types/api";

setPlatformAPI({
  measureText: measureTextEChartsAdapter,
});

export type RenderChartOptions = {
  tokenFeatures: TokenFeatures;
  applicationColors: ColorPalette;
  customFormatting: FormattingSettings;
  startOfWeek: DayOfWeekId | null | undefined;
  // Explicit pixel dimensions for the chart. Use fitWithinBounds to have height include
  // chart legends
  width?: number;
  height?: number;
  // When true, width/height are treated as the exact output box
  fitWithinBounds?: boolean;
};

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

function getRawSeriesWithDashcardSettings(
  rawSeries: RawSeries,
  dashcardSettings: DashCardVisualizationSettings,
): RawSeries {
  return rawSeries.map((series, index) => {
    const isMainCard = index === 0;
    if (isMainCard) {
      return {
        ...series,
        card: extendCardWithDashcardSettings(series.card, dashcardSettings),
      };
    }
    return series;
  });
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

export function RenderChart(
  rawSeries: RawSeries,
  dashcardSettings: RenderChartDashcardSettings,
  options: RenderChartOptions,
) {
  MetabaseSettings.set("token-features", options.tokenFeatures);
  MetabaseSettings.set(
    "application-colors" as SettingKey,
    options.applicationColors,
  );

  if (typeof enterpriseOverrides === "function") {
    enterpriseOverrides();
  }

  MetabaseSettings.set("custom-formatting", options.customFormatting);

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
