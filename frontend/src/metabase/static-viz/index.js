import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";

import "metabase/lib/dayjs";

import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  measureTextEChartsAdapter,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { extractRemappings } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";

import { LegacyStaticChart } from "./containers/LegacyStaticChart";

setPlatformAPI({
  measureText: measureTextEChartsAdapter,
});

// stub setTimeout because GraalVM does not provide it
global.setTimeout = () => {};

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
    formatValue: formatStaticValue,
    measureText: (text, style) =>
      measureTextWidth(text, style.size, style.weight),
    fontFamily: "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif",
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
