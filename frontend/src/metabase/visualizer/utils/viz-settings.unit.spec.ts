import { registerVisualization } from "metabase/visualizations";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import { Map } from "metabase/visualizations/visualizations/Map/Map";

import { getColumnVizSettings } from "./viz-settings";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Map);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(BarChart);

describe("getColumnVizSettings", () => {
  it("should return column settings for visualizer supported display", () => {
    const settings = getColumnVizSettings("bar");
    expect(settings).toStrictEqual(["graph.dimensions", "graph.metrics"]);
  });

  it("should return bar column settings for visualizer not supported display", () => {
    const settings = getColumnVizSettings("map");
    expect(settings).toStrictEqual(["graph.dimensions", "graph.metrics"]);
  });
});
