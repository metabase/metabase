import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";
import type { LegendPosition } from "metabase-types/api";

import type { LegendItemData } from "./LegendItem";
import { LegendLayout } from "./LegendLayout";

const CHAR_WIDTH = 6;

const measureText = (text: string) => text.length * CHAR_WIDTH;

const createItems = (names: string[]): LegendItemData[] =>
  names.map((name) => ({ key: name, name, color: "red" }));

interface SetupOpts {
  names: string[];
  legendPosition?: LegendPosition;
  width?: number;
  height?: number;
  isQueryBuilder?: boolean;
  actionButtons?: React.ReactNode;
}

const setup = ({
  names,
  legendPosition,
  width = 600,
  height = 300,
  isQueryBuilder,
  actionButtons,
}: SetupOpts) => {
  render(
    <LegendLayout
      items={createItems(names)}
      hasLegend
      legendPosition={legendPosition}
      width={width}
      height={height}
      isQueryBuilder={isQueryBuilder}
      actionButtons={actionButtons}
      fontFamily="Lato"
      measureText={measureText}
    >
      <div data-testid="chart" />
    </LegendLayout>,
  );
};

describe("LegendLayout", () => {
  it("should render the chart without a legend on cards smaller than the minimum size", () => {
    setup({ names: ["a", "b"], width: 400, height: 150 });

    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.queryByLabelText("Legend")).not.toBeInTheDocument();
  });

  it("should render a horizontal legend below the chart when the items fit", () => {
    setup({ names: ["first", "second"] });

    const legend = screen.getByTestId("legend-horizontal");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(2);
    expect(screen.queryByTestId("legend-vertical")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("chart").compareDocumentPosition(legend) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("should render a vertical legend next to the chart when the items overflow the row", () => {
    const names = Array.from({ length: 10 }, (_, i) => `series ${i}`);
    setup({ names, width: 420, height: 400 });

    const legend = screen.getByTestId("legend-vertical");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(10);
    expect(legend).toHaveStyle({ width: "66px" });
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("should show the hidden items behind a '+ N more' popover when rows overflow", async () => {
    const names = Array.from({ length: 20 }, (_, i) => `series ${i}`);
    setup({ names, width: 420, height: 200 });

    const legend = screen.getByTestId("legend-vertical");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(7);

    await userEvent.click(screen.getByText("+ 13 more"));

    const popover = await screen.findByRole("dialog");
    expect(within(popover).getAllByTestId("legend-item")).toHaveLength(13);
    expect(within(popover).getByText("series 19")).toBeInTheDocument();
  });

  it("should hide the legend when more than half of the items would be truncated", () => {
    setup({ names: ["a".repeat(40), "b".repeat(40), "c".repeat(40), "d"] });

    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.queryByLabelText("Legend")).not.toBeInTheDocument();
  });

  it("should keep the action buttons above the chart", () => {
    setup({
      names: ["first", "second"],
      actionButtons: <button>action</button>,
    });

    expect(
      screen
        .getByText("action")
        .compareDocumentPosition(screen.getByTestId("chart")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

const isBefore = (element: Element, other: Element) =>
  Boolean(
    element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

describe("LegendLayout with an explicit position", () => {
  const SMALL_CARD = { width: 400, height: 150 };

  it("should render no legend when the position is off", () => {
    setup({ names: ["first", "second"], legendPosition: "off" });

    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.queryByLabelText("Legend")).not.toBeInTheDocument();
  });

  it("should render no legend on a card too small for the automatic layout", () => {
    setup({ names: ["first", "second"], legendPosition: "top", ...SMALL_CARD });

    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.queryByLabelText("Legend")).not.toBeInTheDocument();
  });

  it("should render a top legend above the chart", () => {
    setup({ names: ["first", "second"], legendPosition: "top" });

    const legend = screen.getByTestId("legend-horizontal");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(2);
    expect(isBefore(legend, screen.getByTestId("chart"))).toBe(true);
  });

  it("should render a bottom legend below the chart", () => {
    setup({
      names: ["first", "second"],
      legendPosition: "bottom",
    });

    const legend = screen.getByTestId("legend-horizontal");
    expect(isBefore(screen.getByTestId("chart"), legend)).toBe(true);
  });

  it("should render a left legend before the chart", () => {
    setup({
      names: ["first", "second"],
      legendPosition: "left",
    });

    const legend = screen.getByTestId("legend-vertical");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(2);
    expect(isBefore(legend, screen.getByTestId("chart"))).toBe(true);
  });

  it("should render a right legend after the chart", () => {
    setup({
      names: ["first", "second"],
      legendPosition: "right",
    });

    const legend = screen.getByTestId("legend-vertical");
    expect(isBefore(screen.getByTestId("chart"), legend)).toBe(true);
  });

  it("should keep the action buttons above a top legend", () => {
    setup({
      names: ["first", "second"],
      legendPosition: "top",
      actionButtons: <button>action</button>,
    });

    expect(
      isBefore(
        screen.getByText("action"),
        screen.getByTestId("legend-horizontal"),
      ),
    ).toBe(true);
  });

  it("should show what fits in a top row and list the rest behind '+ N more'", async () => {
    const names = Array.from({ length: 10 }, (_, i) => `series ${i}`);
    setup({ names, legendPosition: "top", width: 420 });

    const legend = screen.getByTestId("legend-horizontal");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(4);
    expect(screen.queryByTestId("legend-vertical")).not.toBeInTheDocument();

    await userEvent.click(within(legend).getByText("+ 6 more"));

    const popover = await screen.findByRole("dialog");
    expect(within(popover).getAllByTestId("legend-item")).toHaveLength(6);
    expect(within(popover).getByText("series 9")).toBeInTheDocument();
  });
});
