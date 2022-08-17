import React from "react";
import ReactDOMServer from "react-dom/server";
import StaticChart from "./containers/StaticChart";
import { colors, color } from "metabase/lib/colors/palette";

export function RenderChart(type, options) {
  return ReactDOMServer.renderToStaticMarkup(
    <StaticChart type={type} options={options} />,
  );
}

export function color_from_name(name) {
  return color(name);
}
export const defaultColors = colors;
