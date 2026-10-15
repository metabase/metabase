/* eslint-disable testing-library/render-result-naming-convention --
   These tests use ReactDOMServer.renderToStaticMarkup (a server-side string render), not an RTL
   render, so the "view"/"utils" naming convention doesn't apply. */
import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { StaticVisualization } from "../StaticVisualization";

const renderingContext = createStaticRenderingContext();

const DIMENSION_COL = createMockColumn({
  name: "type_1",
  display_name: "Type",
  base_type: "type/Text",
});
const METRIC_COL = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/BigInteger",
});

const ROWS = [
  ["Bug", 81],
  ["Dark", 44],
  ["Dragon", 40],
  ["Electric", 61],
  ["Fairy", 22],
  ["Fighting", 38],
  ["Fire", 65],
  ["Flying", 8],
  ["Ghost", 41],
  ["Grass", 91],
  ["Ground", 41],
  ["Ice", 36],
  ["Normal", 115],
  ["Poison", 39],
  ["Psychic", 76],
  ["Rock", 60],
  ["Steel", 36],
  ["Water", 134],
];

// A genuinely-typed pie `RawSeries` (no cast). `pie.show_labels` paints slice labels on the chart,
// which is what exercises getTextColorForBackground -- the source of the hsla() values below.
const pieSeries = (settings: VisualizationSettings = {}): RawSeries => [
  {
    card: createMockCard({
      display: "pie",
      visualization_settings: {
        "pie.dimension": "type_1",
        "pie.metric": "count",
        "pie.show_labels": true,
        ...settings,
      },
    }),
    data: createMockDatasetData({
      cols: [DIMENSION_COL, METRIC_COL],
      rows: ROWS,
    }),
  },
];

const toSvg = (
  rawSeries: RawSeries,
  dimensions?: { width: number; height: number },
) =>
  ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeries}
      renderingContext={renderingContext}
      width={dimensions?.width}
      height={dimensions?.height}
    />,
  );

describe("static PieChart", () => {
  // Slice label colors come from getTextColorForBackground, whose base is hsla(); the static
  // context must map them to hex, since the PDF rasterizer (Batik) can't parse hsla.
  it("renders to an <svg> free of hsl()/hsla() colors, across both legend layouts", () => {
    const bottomLegend = toSvg(pieSeries());
    const sideLegend = toSvg(pieSeries(), { width: 500, height: 300 });
    const sideLegendWithPercent = toSvg(
      pieSeries({ "pie.percent_visibility": "both" }),
      { width: 500, height: 300 },
    );

    expect(bottomLegend).toContain("<svg");
    expect(bottomLegend).not.toMatch(/hsla?\(/);
    expect(sideLegend).toContain("<svg");
    expect(sideLegend).not.toMatch(/hsla?\(/);
    expect(sideLegendWithPercent).toContain("<svg");
    expect(sideLegendWithPercent).not.toMatch(/hsla?\(/);
  });
});
