import React from "react";
import { within } from "@testing-library/dom";
import { renderWithProviders } from "__support__/ui";

// these tests use ChartSettings directly, but logic we're testing lives in ChartNestedSettingSeries
import ChartSettings from "metabase/visualizations/components/ChartSettings";

function getSeries(metricColumnProps) {
  return [
    {
      card: {
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["FOO"],
          "graph.metrics": ["BAR"],
        },
      },
      data: {
        rows: [
          ["a", 1],
          ["b", 2],
        ],
        cols: [
          {
            name: "FOO",
            display_name: "FOO",
            source: "native",
            base_type: "type/Text",
            field_ref: ["field", "FOO", {}],
          },
          {
            name: "BAR",
            display_name: "BAR",
            source: "native",
            base_type: "type/Integer",
            field_ref: ["field", "BAR", {}],
            ...metricColumnProps,
          },
        ],
      },
    },
  ];
}

const setup = seriesDisplay => {
  const series = getSeries(seriesDisplay);
  return renderWithProviders(
    <ChartSettings series={series} initial={{ section: "Data" }} />,
    {
      withSettings: true,
      withEmbedSettings: true,
    },
  );
};

describe("ChartSettinFieldPicker", () => {
  it("should not show ellipsis when a colum has no settings", () => {
    const { getAllByTestId } = setup();

    const fields = getAllByTestId("chartsettings-field-picker");

    expect(fields[0]).toHaveTextContent("FOO");
    expect(fields[1]).toHaveTextContent("BAR");

    expect(
      within(fields[0]).queryByRole("img", { name: /ellipsis/i }),
    ).not.toBeInTheDocument();

    expect(
      within(fields[1]).queryByRole("img", { name: /ellipsis/i }),
    ).toBeInTheDocument();
  });

  it("Should handle 'hasColumnSettings' check when dealing with currency", () => {
    setup({ semantic_type: "type/Currency" });
  });
});
