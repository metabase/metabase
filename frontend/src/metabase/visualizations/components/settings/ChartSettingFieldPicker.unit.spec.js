// these tests use QuestionChartSettings directly, but logic we're testing logic in ChartSettingFieldPicker
import { renderWithProviders, screen, within } from "__support__/ui";
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

const setup = (seriesDisplay) => {
  const series = getSeries(seriesDisplay);
  return renderWithProviders(
    <QuestionChartSettings series={series} initial={{ section: "Data" }} />,
  );
};

// The x-axis (dimension) column has its own formatting settings (e.g. date
// formatting). Those settings must be reachable from the "X-axis" field
// picker, so the settings ("ellipsis") button has to render for the dimension
// column at index 0.
function getSeriesWithDateDimension() {
  return [
    {
      card: createMockCard({
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["BAR"],
        },
      }),
      data: {
        rows: [
          ["2024-01-01", 1],
          ["2024-02-01", 2],
        ],
        cols: [
          {
            name: "CREATED_AT",
            display_name: "Created At",
            source: "native",
            base_type: "type/DateTime",
            effective_type: "type/DateTime",
            field_ref: ["field", "CREATED_AT", {}],
          },
          {
            name: "BAR",
            display_name: "BAR",
            source: "native",
            base_type: "type/Integer",
            field_ref: ["field", "BAR", {}],
          },
        ],
      },
    },
  ];
}

const setupWithDateDimension = () => {
  const series = getSeriesWithDateDimension();
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

  it("should show the column settings button for the x-axis (dimension) column (metabase#51952)", () => {
    setupWithDateDimension();

    const fields = screen.getAllByTestId("chartsettings-field-picker");

    expect(
      within(fields[0]).getByTestId("chart-setting-select"),
    ).toHaveDisplayValue("Created At");

    expect(
      within(fields[0]).getByRole("img", { name: /ellipsis/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("settings-CREATED_AT")).toBeInTheDocument();
  });
});
