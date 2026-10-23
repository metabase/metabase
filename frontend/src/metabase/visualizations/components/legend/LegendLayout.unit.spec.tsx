import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";
import { rem } from "metabase/ui";
import type { TextWidthMeasurer } from "metabase/utils/measure-text";
import type { LegendPosition } from "metabase-types/api";

import type { LegendItemData } from "./LegendItem";
import { LegendLayout } from "./LegendLayout";
import { MIN_LEGEND_CARD_WIDTH } from "./layout";
import { LEGEND_SIZES } from "./sizes";

const CHAR_WIDTH = 6;

const measureTextByLength = (text: string) => text.length * CHAR_WIDTH;

const createItems = (names: string[]): LegendItemData[] =>
  names.map((name) => ({ key: name, name, color: "red" }));

interface SetupOpts {
  names: string[];
  legendPosition?: LegendPosition;
  width?: number;
  height?: number;
  isQueryBuilder?: boolean;
  actionButtons?: React.ReactNode;
  measureText?: TextWidthMeasurer;
}

const setup = ({
  names,
  legendPosition,
  width = 600,
  height = 300,
  isQueryBuilder,
  actionButtons,
  measureText = measureTextByLength,
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

const MOSTLY_TRUNCATED_NAMES = [
  "a".repeat(40),
  "b".repeat(40),
  "c".repeat(40),
  "d",
];

const expectNoLegend = () => {
  expect(screen.getByTestId("chart")).toBeInTheDocument();
  expect(screen.queryByLabelText("Legend")).not.toBeInTheDocument();
};

const isBefore = (element: Element, other: Element) =>
  Boolean(
    element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

describe("LegendLayout", () => {
  it("should render the chart without a legend when the plot would be under 150px wide", () => {
    setup({ names: ["a", "b"], width: 149 });

    expectNoLegend();
  });

  it("should render a vertical legend on a wide short card", () => {
    // row plot 900 x 74.2, column plot 822 x 100: 74.2 < 100 * 75%
    setup({ names: ["first", "second"], width: 900, height: 100 });

    const legend = screen.getByTestId("legend-vertical");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(2);
    expect(screen.queryByTestId("legend-horizontal")).not.toBeInTheDocument();
  });

  it("should render a horizontal legend below the chart when the items fit", () => {
    setup({ names: ["first", "second"] });

    const legend = screen.getByTestId("legend-horizontal");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(2);
    expect(screen.queryByTestId("legend-vertical")).not.toBeInTheDocument();
    expect(isBefore(screen.getByTestId("chart"), legend)).toBe(true);
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
    setup({ names, width: 420, height: 194 });

    const legend = screen.getByTestId("legend-vertical");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(7);

    await userEvent.click(screen.getByText("+ 13 more"));

    const popover = await screen.findByRole("dialog");
    expect(within(popover).getAllByTestId("legend-item")).toHaveLength(13);
    expect(within(popover).getByText("series 19")).toBeInTheDocument();
  });

  it("should render a column with most items truncated on cards at least 420px wide", () => {
    setup({ names: MOSTLY_TRUNCATED_NAMES, width: MIN_LEGEND_CARD_WIDTH });

    const legend = screen.getByTestId("legend-vertical");
    expect(within(legend).getAllByTestId("legend-item")).toHaveLength(4);
  });

  it("should hide a column with most items truncated on narrower cards", () => {
    setup({ names: MOSTLY_TRUNCATED_NAMES, width: MIN_LEGEND_CARD_WIDTH - 1 });

    expectNoLegend();
  });

  it("should keep the action buttons above the chart", () => {
    setup({
      names: ["first", "second"],
      actionButtons: <button>action</button>,
    });

    expect(
      isBefore(screen.getByText("action"), screen.getByTestId("chart")),
    ).toBe(true);
  });
});

describe("LegendLayout with an explicit position", () => {
  it("should render no legend when the position is off", () => {
    setup({ names: ["first", "second"], legendPosition: "off" });

    expectNoLegend();
  });

  it("should not measure the legend labels when the position is off", () => {
    const measureText = jest.fn(measureTextByLength);
    setup({ names: ["first", "second"], legendPosition: "off", measureText });

    expect(measureText).not.toHaveBeenCalled();
  });

  it("should render a bottom legend on a short card", () => {
    setup({
      names: ["first", "second"],
      legendPosition: "bottom",
      width: 300,
      height: 60,
    });

    expect(screen.getByTestId("legend-horizontal")).toBeInTheDocument();
  });

  it("should hide a bottom legend when the plot would be under 150px wide", () => {
    setup({
      names: ["first", "second"],
      legendPosition: "bottom",
      width: 149,
    });

    expectNoLegend();
  });

  it("should render a left column with most items truncated", () => {
    setup({
      names: MOSTLY_TRUNCATED_NAMES,
      legendPosition: "left",
      width: MIN_LEGEND_CARD_WIDTH - 1,
    });

    expect(screen.getByTestId("legend-vertical")).toBeInTheDocument();
  });

  it.each<{
    legendPosition: LegendPosition;
    testId: string;
    isLegendFirst: boolean;
  }>([
    { legendPosition: "top", testId: "legend-horizontal", isLegendFirst: true },
    {
      legendPosition: "bottom",
      testId: "legend-horizontal",
      isLegendFirst: false,
    },
    { legendPosition: "left", testId: "legend-vertical", isLegendFirst: true },
    {
      legendPosition: "right",
      testId: "legend-vertical",
      isLegendFirst: false,
    },
  ])(
    "should render a $legendPosition legend on that side of the chart",
    ({ legendPosition, testId, isLegendFirst }) => {
      setup({ names: ["first", "second"], legendPosition });

      const legend = screen.getByTestId(testId);
      expect(within(legend).getAllByTestId("legend-item")).toHaveLength(2);
      expect(isBefore(legend, screen.getByTestId("chart"))).toBe(isLegendFirst);
    },
  );

  it.each<LegendPosition>(["left", "right"])(
    "should start a %s legend level with the top of the plot",
    (legendPosition) => {
      setup({ names: ["first", "second"], legendPosition });

      expect(screen.getByTestId("legend-vertical")).toHaveStyle({
        marginTop: rem(LEGEND_SIZES.smallCard.contentMargin.rightLegend.top),
      });
    },
  );

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
