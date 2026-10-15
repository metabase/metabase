import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

import type { LegendItemData } from "./LegendItem";
import { LegendLayout } from "./LegendLayout";

const CHAR_WIDTH = 6;

const measureText = (text: string) => text.length * CHAR_WIDTH;

const createItems = (names: string[]): LegendItemData[] =>
  names.map((name) => ({ key: name, name, color: "red" }));

interface SetupOpts {
  names: string[];
  width?: number;
  height?: number;
  isQueryBuilder?: boolean;
  actionButtons?: React.ReactNode;
}

const setup = ({
  names,
  width = 600,
  height = 300,
  isQueryBuilder,
  actionButtons,
}: SetupOpts) => {
  render(
    <LegendLayout
      items={createItems(names)}
      hasLegend
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
