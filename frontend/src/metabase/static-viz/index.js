import "./mock-environment";
import "fast-text-encoding";

import { setPlatformAPI } from "echarts/core";
import "metabase/utils/dayjs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ReactDOMServer from "react-dom/server";

import enterpriseOverrides from "ee-overrides";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";
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

import { LegacyStaticChart } from "./containers/LegacyStaticChart";

// Expose React, jsxRuntime, and utils for custom viz bundles that reference
// window.__METABASE_VIZ_API__ via the metabaseVizExternals Vite plugin.
window.__METABASE_VIZ_API__ = {
  React,
  jsxRuntime,
  columnTypes: customVizColumnTypes,
  formatValue: (value, options) => {
    const result = internalFormatValue(value, { ...options, jsx: false });
    return String(result ?? "");
  },
};

setPlatformAPI({
  measureText: measureTextEChartsAdapter,
});

/**
 * @deprecated use RenderChart instead
 */
export function LegacyRenderChart(type, options) {
  return ReactDOMServer.renderToStaticMarkup(
    <LegacyStaticChart type={type} options={options} />,
  );
}

// Dashcard settings should be merged with the first card settings
// Replicates the logic from frontend/src/metabase/dashboard/components/DashCard/DashCard.tsx
function getRawSeriesWithDashcardSettings(rawSeries, dashcardSettings) {
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

function getVisualizerRawSeries(rawSeries, dashcardSettings) {
  const { columnValuesMapping } = dashcardSettings.visualization;
  const datasets = rawSeries.reduce((acc, series) => {
    if (series.card.id) {
      acc[`card:${series.card.id}`] = series;
    }
    return acc;
  }, {});

  const dataSources = rawSeries.map((series) =>
    createDataSource("card", series.card.id, series.card.name),
  );

  const columns = getVisualizationColumns(
    dashcardSettings.visualization,
    datasets,
    dataSources,
  );

  const mergedData = mergeVisualizerData({
    columns,
    columnValuesMapping,
    datasets,
    dataSources,
  });

  const { display, settings } = dashcardSettings.visualization;
  return [
    {
      card: {
        display,
        visualization_settings: settings,
      },
      data: mergedData,
      columnValuesMapping,
    },
  ];
}

export function registerCustomVizPlugin(factory, identifier, assets) {
  PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin(factory, identifier, assets);
}

/**
 * Initialize the static viz context: set settings and apply enterprise overrides.
 * Must be called before registerCustomVizPlugin so that the EE registry is active.
 */
export function initializeContext(options) {
  MetabaseSettings.set("token-features", options.tokenFeatures);
  MetabaseSettings.set("application-colors", options.applicationColors);
  MetabaseSettings.set("custom-formatting", options.customFormatting);
  MetabaseSettings.set("site-locale", options.locale ?? "en");
  if (typeof enterpriseOverrides === "function") {
    enterpriseOverrides();
  }
}

export function RenderChart(rawSeries, dashcardSettings, options) {
  const renderingContext = createStaticRenderingContext(
    options.applicationColors,
  );

  // If this is a visualizer card, we need to merge the data and split the series if needed
  if ("visualization" in dashcardSettings) {
    const dataSourceNameMap = Object.fromEntries(
      rawSeries.map((series) => {
        const source = createDataSource(
          "card",
          series.card.id,
          series.card.name,
        );
        return [source.id, source.name];
      }),
    );
    rawSeries = getVisualizerRawSeries(rawSeries, dashcardSettings);
    const { display, columnValuesMapping } = dashcardSettings.visualization;
    if (
      display &&
      isCartesianChart(display) &&
      shouldSplitVisualizerSeries(columnValuesMapping)
    ) {
      rawSeries = splitVisualizerSeries(
        rawSeries,
        columnValuesMapping,
        dataSourceNameMap,
      );
    }
  }

  updateStartOfWeek(options.startOfWeek);
  const rawSeriesWithDashcardSettings = getRawSeriesWithDashcardSettings(
    rawSeries,
    dashcardSettings,
  );
  const rawSeriesWithRemappings = extractRemappings(
    rawSeriesWithDashcardSettings,
  );

  const hasDevWatermark = Boolean(options.tokenFeatures?.development_mode);

  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeriesWithRemappings}
      renderingContext={renderingContext}
      hasDevWatermark={hasDevWatermark}
    />,
  );
}
