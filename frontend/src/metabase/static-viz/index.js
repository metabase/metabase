import "./mock-environment";
import "fast-text-encoding";

import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";

import "metabase/lib/dayjs";

import { formatValue } from "metabase/lib/formatting";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import {
  measureTextEChartsAdapter,
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { extractRemappings } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";

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

export function RenderChart(rawSeries, dashcardSettings, colors) {
  const getColor = createColorGetter(colors);
  const renderingContext = {
    getColor,
    formatValue,
    measureText: (text, style) =>
      measureTextWidth(text, style.size, style.weight),
    measureTextHeight: (_, style) => measureTextHeight(style.size),
    fontFamily: "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    theme: DEFAULT_VISUALIZATION_THEME,
  };

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
