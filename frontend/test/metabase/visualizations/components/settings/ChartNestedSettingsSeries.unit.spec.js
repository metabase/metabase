import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render } from "@testing-library/react";

// these tests use ChartSettings directly, but logic we're testing lives in ChartNestedSettingSeries
import ChartSettings from "metabase/visualizations/components/ChartSettings";

function getSeries(display) {
  return [
    {
      card: { display, visualization_settings: {} },
      data: {
        rows: [["a", 1], ["b", 2]],
        cols: [{ name: "foo" }, { name: "bar" }],
      },
    },
  ];
}
describe("ChartNestedSettingSeries", () => {
  it("shouldn't show line/area/bar buttons for row charts", () => {
    const { queryByRole } = render(
      <ChartSettings
        series={getSeries("row")}
        initial={{ section: "Display" }}
      />,
    );

    expect(queryByRole("img", { name: /line/i })).not.toBeInTheDocument();
    expect(queryByRole("img", { name: /area/i })).not.toBeInTheDocument();
    expect(queryByRole("img", { name: /bar/i })).not.toBeInTheDocument();
  });

  it("should show line/area/bar buttons for bar charts", () => {
    const { getByRole } = render(
      <ChartSettings
        series={getSeries("bar")}
        initial={{ section: "Display" }}
      />,
    );

    getByRole("img", { name: /line/i });
    getByRole("img", { name: /area/i });
    getByRole("img", { name: /bar/i });
  });
});
