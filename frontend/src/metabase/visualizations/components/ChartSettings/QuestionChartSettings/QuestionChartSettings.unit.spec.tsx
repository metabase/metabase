import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Series } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { QuestionChartSettings } from "./QuestionChartSettings";

registerVisualizations();

const MESSAGE_WIDGET_ID = "chart-settings-widget-card.no_results_message";

const getSeries = (display: "line" | "scalar"): Series => [
  createMockSingleSeries(
    {
      display,
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    },
    {
      data: createMockDatasetData({
        rows: [["2024-01-01T00:00:00Z", 1]],
        cols: [
          createMockColumn({
            name: "CREATED_AT",
            display_name: "Created At",
            base_type: "type/DateTime",
            effective_type: "type/DateTime",
            unit: "month",
          }),
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/BigInteger",
            effective_type: "type/BigInteger",
            source: "aggregation",
          }),
        ],
      }),
    },
  ),
];

type SetupOpts = {
  display: "line" | "scalar";
};

const setup = ({ display }: SetupOpts) =>
  renderWithProviders(
    <QuestionChartSettings series={getSeries(display)} onChange={jest.fn()} />,
  );

const getWidgetIds = () =>
  screen
    .getAllByTestId(/^chart-settings-widget-/)
    .map((widget) => widget.dataset.testid);

describe("QuestionChartSettings no-results message", () => {
  it("should put the message last in Display, not on Data, for a chart with a Display tab", async () => {
    setup({ display: "line" });

    expect(screen.getByRole("tab", { name: "Data" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByTestId(MESSAGE_WIDGET_ID)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Display" }));

    expect(getWidgetIds().at(-1)).toBe(MESSAGE_WIDGET_ID);
  });

  it("should put the message last in the first tab, without opening a tab for it, on a chart without a Display tab", () => {
    setup({ display: "scalar" });

    expect(getWidgetIds().at(-1)).toBe(MESSAGE_WIDGET_ID);
    expect(
      screen.queryByRole("tab", { name: "Display" }),
    ).not.toBeInTheDocument();
  });
});
