import "fast-text-encoding";

import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";
import "metabase/lib/dayjs";

import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  measureTextWidth,
  measureTextEChartsAdapter,
  measureTextHeight,
} from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";

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

export function RenderChart(rawSeries, dashcardSettings, colors) {
  const getColor = createColorGetter(colors);
  const renderingContext = {
    getColor,
    formatValue: formatStaticValue,
    measureText: (text, style) =>
      measureTextWidth(text, style.size, style.weight),
    measureTextHeight: (_, style) => measureTextHeight(style.size),
    fontFamily: "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    theme: DEFAULT_VISUALIZATION_THEME,
  };

  const props = {
    rawSeries,
    dashcardSettings,
    renderingContext,
  };

  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization {...props} />,
  );
}
