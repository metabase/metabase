import React from "react";
import ReactDOMServer from "react-dom/server";
import StaticChart from "./containers/StaticChart";

function RenderStaticChart(type, options) {
  return ReactDOMServer.renderToStaticMarkup(
    <StaticChart type={type} options={options} />,
  );
}

// eslint-disable-next-line no-undef
globalThis.RenderStaticChart = RenderStaticChart;
