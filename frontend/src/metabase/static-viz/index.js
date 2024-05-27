import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";
import "metabase/lib/dayjs";

import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  measureTextWidth,
  measureTextEChartsAdapter,
} from "metabase/static-viz/lib/text";

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
    fontFamily: "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif",
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
