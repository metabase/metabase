import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";
import type { Series } from "metabase-types/api";

registerVisualizations();

function getSeries(): Series {
  return [
    {
      card: {
        dataset_query: {},
        display: "bar",
        parameters: [],
        visualization_settings: {
          version: 2,
          "stackable.stack_type": "stacked",
          "graph.dimensions": ["CREATED_AT", "CATEGORY"],
          "graph.metrics": ["count"],
          "graph.show_values": true,
          "graph.show_stack_values": "series",
          series_settings: {},
        },
        type: "question",
      },
      data: {
        rows: [
          ["2022-04-01T00:00:00+02:00", "Gadget", 1],
          ["2022-04-01T00:00:00+02:00", "Gizmo", 1],
          ["2022-05-01T00:00:00+02:00", "Doohickey", 3],
        ],
        cols: [
          {
            unit: "month",
            name: "CREATED_AT",
            field_ref: [
              "field",
              63,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "month",
              },
            ],
            effective_type: "type/DateTime",
            base_type: "type/DateTime",
          },
          {
            name: "CATEGORY",
            field_ref: [
              "field",
              18,
              {
                "base-type": "type/Text",
              },
            ],
            effective_type: "type/Text",
            base_type: "type/Text",
          },
          {
            name: "count",
            field_ref: ["aggregation", 0],
            effective_type: "type/BigInteger",
            base_type: "type/BigInteger",
          },
        ],
      },
    },
  ] as any;
}

const setup = ({ series }: { series: Series }) => {
  return renderWithProviders(
    <QuestionChartSettings series={series} initial={{ section: "Data" }} />,
  );
};

describe("ChartNestedSettingSeriesSingle", () => {
  it("should render the `Show values for this series` switch (metabase#53248)", async () => {
    setup({ series: getSeries() });

    const expandButtons = screen.getAllByRole("img", { name: /ellipsis/i });
    expect(expandButtons).toHaveLength(5);

    fireEvent.click(expandButtons[1]);

    await waitFor(() => {
      screen.getByTestId("chart-settings-widget-series_settings");
    });

    expect(
      within(
        screen.getByTestId("chart-settings-widget-series_settings"),
      ).getByTestId("chart-settings-widget-show_series_values"),
    ).not.toHaveAttribute("hidden");
  });

  it("should not render the `Show values for this series` switch when graph.show_stack_values is 'total' (metabase#53248)", async () => {
    const series = getSeries();
    series[0].card.visualization_settings["graph.show_stack_values"] = "total";
    setup({ series });

    const expandButtons = screen.getAllByRole("img", { name: /ellipsis/i });
    expect(expandButtons).toHaveLength(5);

    fireEvent.click(expandButtons[1]);

    await waitFor(() => {
      screen.getByTestId("chart-settings-widget-series_settings");
    });

    expect(
      within(
        screen.getByTestId("chart-settings-widget-series_settings"),
      ).getByTestId("chart-settings-widget-show_series_values"),
    ).toHaveAttribute("hidden");
  });

  it("should render the `Show values for this series` switch when stackable.stack_type is null (metabase#58552)", async () => {
    const series = getSeries();
    series[0].card.visualization_settings["stackable.stack_type"] = null;
    series[0].card.visualization_settings["graph.show_stack_values"] = "total";
    setup({ series });

    const expandButtons = screen.getAllByRole("img", { name: /ellipsis/i });
    fireEvent.click(expandButtons[1]);

    await waitFor(() => {
      screen.getByTestId("chart-settings-widget-series_settings");
    });

    expect(
      within(
        screen.getByTestId("chart-settings-widget-series_settings"),
      ).getByTestId("chart-settings-widget-show_series_values"),
    ).not.toHaveAttribute("hidden");
  });
});
