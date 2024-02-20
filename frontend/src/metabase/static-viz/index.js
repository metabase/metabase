import ReactDOMServer from "react-dom/server";

import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";

import { LegacyStaticChart } from "./containers/LegacyStaticChart";

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
    measureText: measureTextWidth,
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
