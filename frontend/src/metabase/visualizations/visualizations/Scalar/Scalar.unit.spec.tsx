import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import {
  fireEvent,
  render,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import { registerVisualizations } from "metabase/visualizations/register";
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
  // Unjustified type cast. FIXME
  [
    {
      card: createMockCard({ display: "scalar" }),
      data: { rows: [[value]], cols: [createMockColumn({ name: "count" })] },
    },
  ] as Series;

// Unjustified type cast. FIXME
const mockedProps = {} as ComponentProps<typeof Scalar>;

const settings = {
  "scalar.field": "count",
  "card.title": "Scalar Title",
  column: () => ({ column: { base_type: "type/Integer" } }),
};

describe("Scalar", () => {
  it("shouldn't render compact when the value fits the card", () => {
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
    expect(screen.getByText("12,345.6")).toBeInTheDocument();
  });

  it("should render compact when the value doesn't fit the card", () => {
    render(
      <Scalar
        {...mockedProps}
        series={series(12345.6)}
        rawSeries={series(12345.6)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={80}
      />,
    );
    expect(screen.getByText("12.3k")).toBeInTheDocument();
  });

  it("should show one tooltip at a time on the smallest cards", async () => {
    render(
      <Scalar
        {...mockedProps}
        showTitle
        series={series(12345.6)}
        rawSeries={series(12345.6)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={80}
      />,
    );

    // hovering the compacted value shows the full value, not the title
    await userEvent.hover(screen.getByTestId("scalar-container"));
    expect(await screen.findByText("12,345.6")).toBeInTheDocument();
    expect(screen.queryByText("Scalar Title")).not.toBeInTheDocument();
    await userEvent.unhover(screen.getByTestId("scalar-container"));

    // hovering the rest of the card shows the title
    await userEvent.hover(screen.getByTestId("scalar-content"));
    expect(await screen.findByText("Scalar Title")).toBeInTheDocument();
  });

  it("should navigate to the question when the title is clicked", async () => {
    const onChangeCardAndRun = jest.fn();
    render(
      <Scalar
        {...mockedProps}
        showTitle
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        onChangeCardAndRun={onChangeCardAndRun}
        width={230}
        height={150}
      />,
    );

    await userEvent.click(screen.getByText("Scalar Title"));

    expect(onChangeCardAndRun).toHaveBeenCalledWith(
      expect.objectContaining({
        nextCard: expect.objectContaining({ display: "scalar" }),
      }),
    );
  });

  it("should render the real title link from the start so middle-click and copy-link never see a placeholder", () => {
    const getHref = jest.fn(() => "/question/42");
    render(
      <Scalar
        {...mockedProps}
        showTitle
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        onChangeCardAndRun={jest.fn()}
        getHref={getHref}
        width={230}
        height={150}
      />,
    );

    const link = screen.getByTestId("legend-label");
    expect(link).toHaveAttribute("href", "/question/42");

    // interactions refresh the href in case it went stale
    fireEvent.mouseDown(link);
    expect(getHref).toHaveBeenCalledTimes(2);
  });

  it("should navigate from a visualizer card with a single underlying question", async () => {
    const onChangeCardAndRun = jest.fn();
    render(
      <Scalar
        {...mockedProps}
        showTitle
        isVisualizerCard
        titleMenuItems={<div>menu item</div>}
        visualizerRawSeries={series(999)}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        onChangeCardAndRun={onChangeCardAndRun}
        width={230}
        height={150}
      />,
    );

    await userEvent.click(screen.getByText("Scalar Title"));

    expect(onChangeCardAndRun).toHaveBeenCalledWith(
      expect.objectContaining({
        nextCard: expect.objectContaining({ display: "scalar" }),
      }),
    );
  });

  it("should not navigate from a visualizer card with several underlying questions", async () => {
    const onChangeCardAndRun = jest.fn();
    render(
      <Scalar
        {...mockedProps}
        showTitle
        isVisualizerCard
        titleMenuItems={[<div key="1" />, <div key="2" />]}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        onChangeCardAndRun={onChangeCardAndRun}
        width={230}
        height={150}
      />,
    );

    await userEvent.click(screen.getByText("Scalar Title"));

    expect(onChangeCardAndRun).not.toHaveBeenCalled();
  });

  it("should show the description in a tooltip on the title info icon", async () => {
    render(
      <Scalar
        {...mockedProps}
        showTitle
        series={series(12345)}
        rawSeries={series(12345)}
        settings={{ ...settings, "card.description": "Scalar description" }}
        visualizationIsClickable={() => false}
        width={230}
        height={150}
      />,
    );

    await userEvent.hover(screen.getByLabelText("info icon"));

    expect(await screen.findByText("Scalar description")).toBeInTheDocument();
  });

  it("should open the description tooltip with keyboard navigation", async () => {
    render(
      <Scalar
        {...mockedProps}
        showTitle
        series={series(12345)}
        rawSeries={series(12345)}
        settings={{ ...settings, "card.description": "Scalar description" }}
        visualizationIsClickable={() => false}
        width={230}
        height={150}
      />,
    );

    // without a title link, the info icon is the first tabbable element
    await userEvent.tab();

    expect(await screen.findByText("Scalar description")).toBeInTheDocument();
  });

  it("should not show the info icon while editing a dashboard", () => {
    render(
      <Scalar
        {...mockedProps}
        showTitle
        isDashboard
        isEditing
        series={series(12345)}
        rawSeries={series(12345)}
        settings={{ ...settings, "card.description": "Scalar description" }}
        visualizationIsClickable={() => false}
        width={230}
        height={150}
      />,
    );

    expect(screen.queryByLabelText("info icon")).not.toBeInTheDocument();
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

  it("lets Unicode subscript descenders render past the line box (metabase#72443)", () => {
    render(
      <Scalar
        {...mockedProps}
        series={series(344)}
        rawSeries={series(344)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByTestId("scalar-container")).toHaveStyle({
      overflowY: "visible",
    });
  });

  it("should call onVisualizationClick with the clicked element when clickable", async () => {
    const onVisualizationClick = jest.fn();
    render(
      <Scalar
        {...mockedProps}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => true}
        onVisualizationClick={onVisualizationClick}
        width={230}
      />,
    );

    await userEvent.click(screen.getByText("12,345"));

    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 12345,
        column: expect.objectContaining({ name: "count" }),
        element: expect.any(HTMLElement),
      }),
    );
  });

  it("should fall back to the first column when scalar.field matches no column", () => {
    render(
      <Scalar
        {...mockedProps}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={{ ...settings, "scalar.field": "not-a-column" }}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );

    expect(screen.getByText("12,345")).toBeInTheDocument();
  });
});

describe("scalar viz settings", () => {
  beforeAll(() => {
    registerVisualizations();
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
      await screen.findByRole("tab", { name: "Formatting" }),
    ).toHaveAttribute("aria-selected", "true");
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
      await screen.findByRole("tab", { name: "Formatting" }),
    ).toHaveAttribute("aria-selected", "true");

    expect(
      screen.queryByTestId("chart-settings-widget-scalar.field"),
    ).not.toBeInTheDocument();
  });
});
