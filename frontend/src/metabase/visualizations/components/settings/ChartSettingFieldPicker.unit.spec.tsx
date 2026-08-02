// these tests use QuestionChartSettings directly, but logic we're testing lives in ChartSettingFieldPicker
import type { ComponentProps } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import { ChartSettingFieldPicker } from "metabase/visualizations/components/settings/ChartSettingFieldPicker";
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

// The x-axis (dimension) column has its own formatting settings (e.g. date
// formatting). Those settings must be reachable from the "X-axis" field
// picker, so the settings ("ellipsis") button has to render for the dimension
// column at index 0.
function getSeriesWithDateDimension(): Series {
  return [
    createMockSingleSeries(
      {
        id: 1,
        name: "Card",
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["BAR"],
        },
      },
      {
        data: {
          rows: [
            ["2024-01-01", 1],
            ["2024-02-01", 2],
          ],
          cols: [
            createMockColumn({
              name: "CREATED_AT",
              display_name: "Created At",
              source: "native",
              base_type: "type/DateTime",
              effective_type: "type/DateTime",
            }),
            createMockColumn({
              name: "BAR",
              display_name: "BAR",
              source: "native",
              base_type: "type/Integer",
            }),
          ],
        },
      },
    ),
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

  // Guards against series names overflowing the trailing buttons (metabase#52975):
  // the input reserves right-side space proportional to how many trailing buttons
  // (chevron / ellipsis / remove) are actually shown, so long column names cannot
  // slide underneath them.
  describe("right section space reservation (metabase#52975)", () => {
    const TWO_OPTIONS = [
      { name: "column one", value: "ONE" },
      { name: "column two", value: "TWO" },
    ];

    const renderFieldPicker = (
      props: Partial<ComponentProps<typeof ChartSettingFieldPicker>>,
    ) =>
      renderWithProviders(
        <ChartSettingFieldPicker
          options={TWO_OPTIONS}
          value="ONE"
          onChange={jest.fn()}
          {...props}
        />,
      );

    const getReservedInputPadding = () => {
      const root = screen
        .getByTestId("chartsettings-field-picker")
        .querySelector<HTMLElement>(".mb-mantine-Select-root");
      return root?.style.getPropertyValue(
        "--chart-setting-select-input-padding-right",
      );
    };

    it("reserves more space when the chevron, ellipsis, and remove buttons are all shown", () => {
      renderFieldPicker({ fieldSettingWidget: "foo", onRemove: jest.fn() });

      // 3 buttons: 3 * 22 (button) + 16 (section padding) + 8 (input padding) = 90
      expect(getReservedInputPadding()).toBe("90px");
    });

    it("reserves less space when only the chevron button is shown", () => {
      renderFieldPicker({});

      // 1 button: 1 * 22 (button) + 16 (section padding) + 8 (input padding) = 46
      expect(getReservedInputPadding()).toBe("46px");
    });
  });
});
