import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";

// eslint-disable-next-line import/order
import enterpriseOverrides from "ee-overrides";
import "metabase/utils/dayjs";

// Deep import (not the metabase/plugins barrel) so the static-viz bundle
// doesn't pull in every plugin module.
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import {
  StaticChoropleth,
  getStaticChoroplethSettings,
} from "metabase/static-viz/components/StaticChoropleth";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { LegacyStaticChart } from "metabase/static-viz/containers/LegacyStaticChart";
import type { LegacyStaticChartType } from "metabase/static-viz/containers/LegacyStaticChart/LegacyStaticChart";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";
import { updateStartOfWeek } from "metabase/utils/i18n";
import MetabaseSettings from "metabase/utils/settings";
import { extractRemappings, isCartesianChart } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";
import { createDataSource } from "metabase/visualizer/utils/data-source";
import { getVisualizationColumns } from "metabase/visualizer/utils/get-visualization-columns";
import { mergeVisualizerData } from "metabase/visualizer/utils/merge-data";
import {
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "metabase/visualizer/utils/split-series";
import type {
  Card,
  CustomVizPluginId,
  DashCardVisualizationSettings,
  Dataset,
  DatasetData,
  GeoJSONData,
  RawSeries,
  SettingKey,
  VisualizerDataSourceId,
  VisualizerVizDefinition,
} from "metabase-types/api";

import type {
  CellBackgroundColorsInput,
  RenderChartDashcardSettings,
  RenderChartInput,
  RenderChartOptions,
  RenderedChart,
} from "./types";

export type {
  CellBackgroundColorsInput,
  RenderChartInput,
  RenderChartOptions,
  RenderedChart,
} from "./types";

setPlatformAPI({
  measureText: measureTextEChartsAdapter,
});

/**
 * @deprecated use RenderChart instead
 */
function LegacyRenderChart(type: LegacyStaticChartType, options: unknown) {
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

  // Unjustified type cast. FIXME
  const datasets = Object.fromEntries(
    rawSeries
      .filter((series) => series.card.id)
      .map((series) => [`card:${series.card.id}`, series]),
  ) as unknown as Record<VisualizerDataSourceId, Dataset | null | undefined>;

  const columns = getVisualizationColumns(visualization, datasets, dataSources);

  return [
    {
      // Unjustified type cast. FIXME
      card: {
        display,
        visualization_settings: settings,
      } as Card,
      // Unjustified type cast. FIXME
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
 * Called by RenderChart on every render; the backend also calls it directly
 * before registerCustomVizPlugin so that the EE registry is active.
 */
export function initializeContext(options: RenderChartOptions) {
  MetabaseSettings.set("token-features", options.tokenFeatures);
  MetabaseSettings.set(
    // Unjustified type cast. FIXME
    "application-colors" as SettingKey,
    options.applicationColors,
  );

  if (typeof enterpriseOverrides === "function") {
    enterpriseOverrides();
  }

  MetabaseSettings.set("custom-formatting", options.customFormatting);
  MetabaseSettings.set("site-locale", options.locale ?? "en");
}

export function registerCustomVizPlugin(
  factory: Parameters<typeof PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin>[0],
  identifier: string,
  pluginId: CustomVizPluginId,
) {
  PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin(factory, identifier, pluginId);
}

function RenderChart(
  rawSeries: RawSeries,
  dashcardSettings: RenderChartDashcardSettings,
  options: RenderChartOptions,
) {
  initializeContext(options);

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
    // Unjustified type cast. FIXME
    const extraSettings = dashcardSettings as Record<string, unknown>;
    // Unjustified type cast. FIXME
    const geoJson = extraSettings["map._geojson"] as GeoJSONData | undefined;
    // Unjustified type cast. FIXME
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

export function renderChart(input: RenderChartInput): RenderedChart {
  let content: string;
  switch (input.kind) {
    case "funnel":
      content = LegacyRenderChart("funnel", {
        data: input.data,
        settings: input.settings,
        tokenFeatures: input.tokenFeatures,
      });
      break;
    case "gauge":
      content = LegacyRenderChart("gauge", {
        card: input.card,
        data: input.data,
        tokenFeatures: input.tokenFeatures,
      });
      break;
    default:
      content = RenderChart(
        input.rawSeries,
        input.dashcardSettings,
        input.options,
      );
  }
  return { type: content.startsWith("<svg") ? "svg" : "html", content };
}

function buildCellBackgroundGetter(
  ...args: Parameters<typeof makeCellBackgroundGetter>
) {
  try {
    return makeCellBackgroundGetter(...args);
  } catch (e) {
    console.error("Error building cell background getter", e);
    return () => null;
  }
}

export function getCellBackgroundColors({
  rows,
  cols,
  settings,
  cells,
}: CellBackgroundColorsInput): (string | null)[] {
  const getter = buildCellBackgroundGetter(
    rows,
    cols,
    settings?.["table.column_formatting"] ?? [],
    Boolean(settings?.["table.pivot"]),
  );
  return cells.map(
    ([value, rowIndex, columnName]) =>
      getter(value, rowIndex, columnName) ?? null,
  );
}
