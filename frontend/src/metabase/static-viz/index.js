import React from "react";
import ReactDOMServer from "react-dom/server";
import StaticChart from "./containers/StaticChart";

export function RenderChart(type, data) {
  return ReactDOMServer.renderToStaticMarkup(
    <StaticChart type={type} data={data} />,
  );
}
