import ReactDOMServer from "react-dom/server";

import { TimeseriesBar, TimeseriesLine } from "metabase/static-viz/timeseries/";
import { Donut } from "metabase/static-viz/categorical/";

const DEFAULTS = {
  width: 540,
  height: 300,
  margin: {
    top: 20,
    right: 20,
    bottom: 20,
    left: 20,
  },
  colors: {
    axis: {
      stroke: "#b8bbc3",
      label: {
        fill: "#949aab",
      },
    },
  },
};

const TIMESERIES_BAR = "timeseries/bar";
const TIMESERIES_LINE = "timeseries/line";
const CATEGORICAL_DONUT = "categorical/donut";

export function RenderChart(type, logic, layout = DEFAULTS) {
  // TODO - rename as innerWidth / innerHeight
  const xMax = layout.width - layout.margin.left - layout.margin.right;
  const yMax = layout.height - layout.margin.top - layout.margin.bottom;

  let chart;
  switch (type) {
    case TIMESERIES_BAR:
      chart = TimeseriesBar(logic, { ...layout, xMax, yMax });
      break;
    case TIMESERIES_LINE:
      chart = TimeseriesLine(logic, { ...layout, xMax, yMax });
      break;
    case CATEGORICAL_DONUT:
      chart = Donut(logic, { ...layout, height: 540, xMax, yMax });
      break;
  }

  return ReactDOMServer.renderToStaticMarkup(chart);
}
