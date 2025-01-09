// these tests use QuestionChartSettings directly, but logic we're testing logic in ChartSettingFieldPicker
import { within } from "@testing-library/react";

import { renderWithProviders, screen } from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";
import { createMockCard } from "metabase-types/api/mocks";

registerVisualizations();

function getSeries(metricColumnProps) {
  return [
    {
      card: createMockCard({
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["FOO"],
          "graph.metrics": ["BAR"],
        },
      }),
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
    <QuestionChartSettings series={series} initial={{ section: "Data" }} />,
  );
};

describe("ChartSettingFieldPicker", () => {
  it("should not show ellipsis when a column has no settings", () => {
    setup();

    const fields = screen.getAllByTestId("chartsettings-field-picker");

    expect(
      within(fields[0]).getByTestId("chart-setting-select"),
    ).toHaveDisplayValue("FOO");
    expect(
      within(fields[1]).getByTestId("chart-setting-select"),
    ).toHaveDisplayValue("BAR");

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
