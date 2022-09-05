import React from "react";
import { renderWithProviders } from "__support__/ui";

// these tests use ChartSettings directly, but logic we're testing lives in ChartNestedSettingSeries
import ChartSettings from "metabase/visualizations/components/ChartSettings";

function getSeries(display) {
  return [
    {
      card: { display, visualization_settings: {} },
      data: {
        rows: [
          ["a", 1],
          ["b", 2],
        ],
        cols: [{ name: "foo" }, { name: "bar" }],
      },
    },
  ];
}

const setup = seriesDisplay => {
  return renderWithProviders(
    <ChartSettings
      series={getSeries(seriesDisplay)}
      initial={{ section: "Display" }}
    />,
    {
      withSettings: true,
      withEmbedSettings: true,
    },
  );
};

describe("ChartNestedSettingSeries", () => {
  it("shouldn't show line/area/bar buttons for row charts", () => {
    const { queryByRole } = setup("row");

    expect(queryByRole("img", { name: /line/i })).not.toBeInTheDocument();
    expect(queryByRole("img", { name: /area/i })).not.toBeInTheDocument();
    expect(queryByRole("img", { name: /bar/i })).not.toBeInTheDocument();
  });

  it("should show line/area/bar buttons for bar charts", () => {
    const { getByRole } = setup("bar");

    getByRole("img", { name: /line/i });
    getByRole("img", { name: /area/i });
    getByRole("img", { name: /bar/i });
  });
});
