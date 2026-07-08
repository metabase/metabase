/* eslint-disable testing-library/render-result-naming-convention --
   These tests use ReactDOMServer.renderToStaticMarkup (a server-side string render), not an RTL
   render, so the "view"/"utils" naming convention doesn't apply. */
import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { RawSeries } from "metabase-types/api";

import { StaticVisualization } from "../StaticVisualization";

import { data } from "./stories-data";

const renderingContext = createStaticRenderingContext();

const toSvg = (
  rawSeries: unknown,
  dimensions?: { width: number; height: number },
) =>
  ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeries as RawSeries}
      renderingContext={renderingContext}
      width={dimensions?.width}
      height={dimensions?.height}
    />,
  );

describe("static PieChart", () => {
  it("renders the pie to an <svg>", () => {
    expect(toSvg(data.labelsOnChart)).toContain("<svg");
  });

  it("emits no hsl()/hsla() colors, which Batik can't parse", () => {
    // Slice label colors come from getTextColorForBackground, whose base values are hsla(); the
    // static rendering context must normalize them to hex for the PDF/Batik rasterizer. Cover both
    // layouts: bottom legend (no dimensions) and side legend (wide box -- the PDF export path).
    expect(toSvg(data.labelsOnChart)).not.toMatch(/hsla?\(/);
    expect(toSvg(data.labelsOnChart, { width: 500, height: 300 })).not.toMatch(
      /hsla?\(/,
    );
    expect(
      toSvg(data.labelsWithPercent, { width: 500, height: 300 }),
    ).not.toMatch(/hsla?\(/);
  });
});
