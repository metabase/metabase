import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { render, renderWithProviders, screen, within } from "__support__/ui";
import { registerVisualization } from "metabase/visualizations";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { Scalar } from "./Scalar";

const series = (value: number | null = 1.23) =>
  [
    {
      card: createMockCard({ display: "scalar" }),
      data: { rows: [[value]], cols: [createMockColumn({ name: "count" })] },
    },
  ] as Series;

const mockedProps = {} as ComponentProps<typeof Scalar>;

const settings = {
  "scalar.field": "count",
  "card.title": "Scalar Title",
  column: () => ({ column: { base_type: "type/Integer" } }),
};

describe("Scalar", () => {
  it("shouldn't render compact if normal formatting is <=6 characters", () => {
    render(
      <Scalar
        {...mockedProps}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByText("12,345")).toBeInTheDocument(); // with compact formatting, we'd have 1
  });

  it("should render compact if normal formatting is >6 characters", () => {
    render(
      <Scalar
        {...mockedProps}
        series={series(12345.6)}
        rawSeries={series(12345.6)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByText("12.3k")).toBeInTheDocument();
  });

  it("should render null", () => {
    render(
      <Scalar
        {...mockedProps}
        isDashboard // displays title
        showTitle
        series={series(null)}
        rawSeries={series(null)}
        settings={settings}
        visualizationIsClickable={() => false}
      />,
    );
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("should not apply text-overflow ellipsis to the container", () => {
    render(
      <Scalar
        {...mockedProps}
        series={series(1234567)}
        rawSeries={series(1234567)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    const container = screen.getByTestId("scalar-container");
    const styles = window.getComputedStyle(container);
    // The container should not have text-overflow: ellipsis
    // as the ScalarValue component handles sizing to fit
    expect(styles.textOverflow).not.toBe("ellipsis");
  });
});

describe("scalar viz settings", () => {
  beforeAll(() => {
    // @ts-expect-error: incompatible prop types with registerVisualization
    registerVisualization(Scalar);
  });

  it("should render the field to show input in the formatting section if there are 2 or more columns", async () => {
    const series = [
      createMockSingleSeries(
        createMockCard({ display: "scalar" }),
        createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockColumn({
                display_name: "FOO",
                source: "native",
                name: "FOO",
              }),
              createMockColumn({
                display_name: "BAR",
                source: "native",
                name: "BAR",
              }),
            ],
          }),
        }),
      ),
    ];
    renderWithProviders(<QuestionChartSettings series={series} />);

    expect(
      await screen.findByRole("radio", { name: "Formatting" }),
    ).toBeChecked();
    expect(await screen.findByText("Field to show")).toBeInTheDocument();

    const getFieldSelect = async () =>
      await within(
        await screen.findByTestId("chart-settings-widget-scalar.field"),
      ).findByRole("textbox");

    expect(await getFieldSelect()).toHaveDisplayValue("FOO");
    await userEvent.click(await getFieldSelect());

    expect(await screen.findByRole("listbox")).toHaveTextContent("FOO");
    expect(await screen.findByRole("listbox")).toHaveTextContent("BAR");
  });

  it("should not render the field to show input in the formatting section if there is only 1 columns", async () => {
    const series = [
      createMockSingleSeries(
        createMockCard({ display: "scalar" }),
        createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockColumn({
                display_name: "BAR",
                source: "native",
                name: "BAR",
              }),
            ],
          }),
        }),
      ),
    ];
    renderWithProviders(<QuestionChartSettings series={series} />);

    expect(
      await screen.findByRole("radio", { name: "Formatting" }),
    ).toBeChecked();

    expect(
      screen.queryByTestId("chart-settings-widget-scalar.field"),
    ).not.toBeInTheDocument();
  });
});
