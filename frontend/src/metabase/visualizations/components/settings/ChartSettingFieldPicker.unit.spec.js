// these tests use ChartSettings directly, but logic we're testing logic in ChartSettingFieldPicker
import { within } from "@testing-library/react";

import { renderWithProviders, screen } from "__support__/ui";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";

registerVisualizations();

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
  );
};

describe("ChartSettingFieldPicker", () => {
  it("should not show ellipsis when a colum has no settings", () => {
    setup();

    const fields = screen.getAllByTestId("chartsettings-field-picker");

    expect(fields[0]).toHaveTextContent("FOO");
    expect(fields[1]).toHaveTextContent("BAR");

    expect(
      within(fields[0]).queryByRole("img", { name: /ellipsis/i }),
    ).not.toBeInTheDocument();

    expect(
      within(fields[1]).getByRole("img", { name: /ellipsis/i }),
    ).toBeInTheDocument();
  });

  it("should handle 'hasColumnSettings' check when dealing with currency", () => {
    expect(() => setup({ semantic_type: "type/Currency" })).not.toThrow();
  });
});
