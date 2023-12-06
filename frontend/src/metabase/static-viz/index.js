import ReactDOMServer from "react-dom/server";
import StaticChart from "./containers/StaticChart";

// stub setTimeout because GraalVM does not provide it
global.setTimeout = () => {};

export function RenderChart(type, options) {
  return ReactDOMServer.renderToStaticMarkup(
    <StaticChart type={type} options={options} />,
  );
}
