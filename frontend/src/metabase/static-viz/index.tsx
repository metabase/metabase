import "./mock-environment";
import "fast-text-encoding";

import { setPlatformAPI } from "echarts/core";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ReactDOMServer from "react-dom/server";

// eslint-disable-next-line import/order
import enterpriseOverrides from "ee-overrides";
import "metabase/utils/dayjs";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { LegacyStaticChart } from "metabase/static-viz/containers/LegacyStaticChart";
import type { LegacyStaticChartType } from "metabase/static-viz/containers/LegacyStaticChart/LegacyStaticChart";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";
import type { ColorPalette } from "metabase/ui/colors/types";
import type { OptionsType } from "metabase/utils/formatting/types";
import { formatValue as internalFormatValue } from "metabase/utils/formatting/value";
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
import { customVizColumnTypes } from "metabase-lib/v1/types/utils/custom-viz-column-types";
import type {
  Card,
  DashCardVisualizationSettings,
  Dataset,
  DatasetData,
  DayOfWeekId,
  FormattingSettings,
  RawSeries,
  SettingKey,
  TokenFeatures,
  VisualizerDataSourceId,
  VisualizerVizDefinition,
} from "metabase-types/api";

type StaticVizApiWindow = Omit<Window, "__METABASE_VIZ_API__"> & {
  __METABASE_VIZ_API__?: Omit<
    NonNullable<Window["__METABASE_VIZ_API__"]>,
    // unsupported in static viz
    "measureText" | "measureTextHeight" | "measureTextWidth"
  >;
};

// Expose React, jsxRuntime, and utils for custom viz bundles that reference
// window.__METABASE_VIZ_API__ via the metabaseVizExternals Vite plugin.
(window as StaticVizApiWindow).__METABASE_VIZ_API__ = {
  React,
  jsxRuntime,
  columnTypes: customVizColumnTypes,
  formatValue: (value: unknown, options?: OptionsType) => {
    const result = internalFormatValue(value, { ...options, jsx: false });
    return String(result ?? "");
  },
};

setPlatformAPI({
  measureText: measureTextEChartsAdapter,
});

export type RenderChartOptions = {
  tokenFeatures: TokenFeatures;
  applicationColors: ColorPalette;
  customFormatting: FormattingSettings;
  startOfWeek: DayOfWeekId | null | undefined;
  locale?: string | null;
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

export function registerCustomVizPlugin(
  factory: Parameters<typeof PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin>[0],
  identifier: string,
  assets: Record<string, string> | undefined,
) {
  PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin(factory, identifier, assets);
}

/**
 * Initialize the static viz context: set settings and apply enterprise overrides.
 * Must be called before registerCustomVizPlugin so that the EE registry is active.
 */
export function initializeContext(options: RenderChartOptions) {
  MetabaseSettings.set("token-features", options.tokenFeatures);
  MetabaseSettings.set(
    "application-colors" as SettingKey,
    options.applicationColors,
  );
  MetabaseSettings.set("custom-formatting", options.customFormatting);
  MetabaseSettings.set("site-locale", options.locale ?? "en");

  if (typeof enterpriseOverrides === "function") {
    enterpriseOverrides();
  }
}

export function RenderChart(
  rawSeries: RawSeries,
  dashcardSettings: RenderChartDashcardSettings,
  options: RenderChartOptions,
) {
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

  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeriesWithRemappings}
      renderingContext={renderingContext}
      hasDevWatermark={hasDevWatermark}
    />,
  );
}
