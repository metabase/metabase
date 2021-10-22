import React from "react";
import ReactDOMServer from "react-dom/server";

import StaticChart from "./containers/StaticChart";

export function RenderChart(type, options) {
  return ReactDOMServer.renderToStaticMarkup(
    <StaticChart type={type} options={options} />,
  );
}
