import "fast-text-encoding";

import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";
import "metabase/lib/dayjs";

import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/static-rendering-context";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";

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
  const renderingContext = createStaticRenderingContext(colors);

  const props = {
    rawSeries,
    dashcardSettings,
    renderingContext,
  };

  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization {...props} />,
  );
}
