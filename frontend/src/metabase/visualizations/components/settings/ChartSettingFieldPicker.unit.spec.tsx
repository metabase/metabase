// these tests use QuestionChartSettings directly, but logic we're testing lives in ChartSettingFieldPicker
import { renderWithProviders, screen, within } from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DatasetColumn, Series } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

function getSeries(metricColumnProps?: Partial<DatasetColumn>): Series {
  return [
    createMockSingleSeries(
      {
        id: 1,
        name: "Card",
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["FOO"],
          "graph.metrics": ["BAR"],
        },
      },
      {
        data: {
          rows: [
            ["a", 1],
            ["b", 2],
          ],
          cols: [
            createMockColumn({
              name: "FOO",
              display_name: "FOO",
              source: "native",
              base_type: "type/Text",
            }),
            createMockColumn({
              name: "BAR",
              display_name: "BAR",
              source: "native",
              base_type: "type/Integer",
              ...metricColumnProps,
            }),
          ],
        },
      },
    ),
  ];
}

const setup = (seriesDisplay?: Partial<DatasetColumn>) => {
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
