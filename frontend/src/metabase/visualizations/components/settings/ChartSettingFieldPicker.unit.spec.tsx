// these tests use QuestionChartSettings directly, but logic we're testing lives in ChartSettingFieldPicker
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  DatasetColumn,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
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

  describe("series of a bar chart (metabase#52975)", () => {
    const REGULAR_NAME = "regular column";
    const LONG_NAME_1 =
      "very very very very very very very very very very very long column 1";
    const LONG_NAME_2 =
      "very very very very very very very very very very very long column 2";

    const BarChartSettings = () => {
      const [settings, setSettings] = useState<VisualizationSettings>({});
      const series: Series = [
        createMockSingleSeries(
          {
            id: 1,
            name: "52975",
            display: "bar",
            visualization_settings: settings,
          },
          {
            data: {
              rows: [["foo", 10, 20, 20]],
              cols: [
                createMockColumn({
                  name: "X",
                  display_name: "X",
                  source: "native",
                  base_type: "type/Text",
                }),
                ...[REGULAR_NAME, LONG_NAME_1, LONG_NAME_2].map((name) =>
                  createMockColumn({
                    name,
                    display_name: name,
                    source: "native",
                    base_type: "type/Integer",
                  }),
                ),
              ],
            },
          },
        ),
      ];
      return (
        <QuestionChartSettings
          series={series}
          initial={{ section: "Data" }}
          onChange={(newSettings) => setSettings(newSettings)}
        />
      );
    };

    const getPicker = (index: number) =>
      screen.getAllByTestId("chartsettings-field-picker")[index];

    const getIcon = (picker: HTMLElement, name: string) =>
      within(picker).queryByRole("img", { name: `${name} icon` });

    it("should show the actions that each series picker allows", async () => {
      renderWithProviders(<BarChartSettings />);
      expect(screen.getAllByTestId("chartsettings-field-picker")).toHaveLength(
        4,
      );

      // every column is in use, so there is nothing to change the last one to
      const lastPicker = getPicker(3);
      expect(
        within(lastPicker).getByTestId("chart-setting-select"),
      ).toHaveDisplayValue(LONG_NAME_2);
      expect(
        within(lastPicker).getByTestId("color-selector-button"),
      ).toBeInTheDocument();
      expect(getIcon(lastPicker, "chevrondown")).not.toBeInTheDocument();
      expect(getIcon(lastPicker, "ellipsis")).toBeInTheDocument();
      expect(getIcon(lastPicker, "grabber")).toBeInTheDocument();
      expect(getIcon(lastPicker, "close")).toBeInTheDocument();
      await userEvent.click(
        within(lastPicker).getByTestId(`remove-${LONG_NAME_2}`),
      );

      expect(screen.getAllByTestId("chartsettings-field-picker")).toHaveLength(
        3,
      );
      const secondPicker = getPicker(2);
      expect(
        within(secondPicker).getByTestId("chart-setting-select"),
      ).toHaveDisplayValue(LONG_NAME_1);
      expect(
        within(secondPicker).getByTestId("color-selector-button"),
      ).toBeInTheDocument();
      expect(getIcon(secondPicker, "chevrondown")).toBeInTheDocument();
      expect(getIcon(secondPicker, "ellipsis")).toBeInTheDocument();
      expect(getIcon(secondPicker, "grabber")).toBeInTheDocument();
      expect(getIcon(secondPicker, "close")).toBeInTheDocument();
      await userEvent.click(
        within(secondPicker).getByTestId(`remove-${LONG_NAME_1}`),
      );

      // the only series can be neither moved nor removed
      expect(screen.getAllByTestId("chartsettings-field-picker")).toHaveLength(
        2,
      );
      const firstPicker = getPicker(1);
      expect(
        within(firstPicker).getByTestId("chart-setting-select"),
      ).toHaveDisplayValue(REGULAR_NAME);
      expect(
        within(firstPicker).getByTestId("color-selector-button"),
      ).toBeInTheDocument();
      expect(getIcon(firstPicker, "chevrondown")).toBeInTheDocument();
      expect(getIcon(firstPicker, "ellipsis")).toBeInTheDocument();
      expect(getIcon(firstPicker, "grabber")).not.toBeInTheDocument();
      expect(getIcon(firstPicker, "close")).not.toBeInTheDocument();
    });
  });
});
