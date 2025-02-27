import "./mock-environment";
import "fast-text-encoding";

import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";

import "metabase/lib/dayjs";

import { updateStartOfWeek } from "metabase/lib/i18n";
import MetabaseSettings from "metabase/lib/settings";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";
import { extractRemappings } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import {
  createDataSource,
  mergeVisualizerData,
} from "metabase/visualizer/utils";

import { LegacyStaticChart } from "./containers/LegacyStaticChart";

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

function getVisualizerRawSeries(cards, dashcardSettings) {
  const { columns, columnValuesMapping } = dashcardSettings.visualization;
  const datasets = cards.reduce((acc, card) => {
    if (card.card.id) {
      acc[`card:${card.card.id}`] = card;
    }
    return acc;
  }, {});

  const dataSources = cards.map(card =>
    createDataSource("card", card.card.id, card.card.name),
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
      started_at: new Date().toISOString(),
    },
  ];
}

export function RenderChart(rawSeries, dashcardSettings, options) {
  const renderingContext = createStaticRenderingContext(
    options.applicationColors,
  );

  if ("visualization" in dashcardSettings) {
    rawSeries = getVisualizerRawSeries(rawSeries, dashcardSettings);
  }

  updateStartOfWeek(options.startOfWeek);
  MetabaseSettings.set("custom-formatting", options.customFormatting);

  const rawSeriesWithDashcardSettings = getRawSeriesWithDashcardSettings(
    rawSeries,
    dashcardSettings,
  );
  const rawSeriesWithRemappings = extractRemappings(
    rawSeriesWithDashcardSettings,
  );

  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeriesWithRemappings}
      renderingContext={renderingContext}
    />,
  );
}
