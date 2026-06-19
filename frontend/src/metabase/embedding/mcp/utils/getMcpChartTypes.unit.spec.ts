import type { CardDisplayType } from "metabase-types/api";

import { getMcpChartTypes } from "./getMcpChartTypes";

const getChartTypes = ({
  defaultDisplay,
  sensibleVisualizations = [],
  canShowTable = true,
}: {
  defaultDisplay: CardDisplayType;
  sensibleVisualizations?: CardDisplayType[];
  canShowTable?: boolean;
}) =>
  getMcpChartTypes({
    defaultDisplay,
    sensibleVisualizations,
    canShowTable,
  }).map(({ type }) => type);

describe("getMcpChartTypes", () => {
  // Based on the design feedback: if the sensible visualization
  // renders a pie chart by default but it's not the standard MCP viz type,
  // we should still show it so they can switch back.
  it("keeps the default visualization in selector even when it is not a MCP viz type", () => {
    expect(
      getChartTypes({
        defaultDisplay: "pie",
        sensibleVisualizations: ["pie", "bar", "line"],
      }),
    ).toEqual(["pie", "bar", "table"]);
  });

  it("does not add a chart type that is not sensible", () => {
    expect(
      getChartTypes({
        defaultDisplay: "scalar",
        sensibleVisualizations: ["scalar"],
      }),
    ).toEqual(["scalar", "table"]);
  });

  it("does not add a fallback chart when the visualization is already a bar chart", () => {
    expect(
      getChartTypes({ defaultDisplay: "bar", sensibleVisualizations: ["bar"] }),
    ).toEqual(["bar", "table"]);
  });

  it("does not add a fallback chart for scalar results when table is not visible", () => {
    expect(
      getChartTypes({
        defaultDisplay: "scalar",
        sensibleVisualizations: ["scalar"],
        canShowTable: false,
      }),
    ).toEqual(["scalar"]);
  });
});
