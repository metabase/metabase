import { setPlatformAPI } from "echarts";
import ReactDOMServer from "react-dom/server";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";
import StaticChart from "./containers/StaticChart";

setPlatformAPI({
  measureText: measureTextEChartsAdapter,
});

// stub setTimeout because GraalVM does not provide it
global.setTimeout = () => {};

export function RenderChart(type, options) {
  return ReactDOMServer.renderToStaticMarkup(
    <StaticChart type={type} options={options} />,
  );
}
