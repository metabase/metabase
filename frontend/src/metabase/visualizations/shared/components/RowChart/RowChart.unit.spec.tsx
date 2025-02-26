import userEvent from "@testing-library/user-event";
import type { NumberValue } from "d3-scale";

import { render, screen } from "__support__/ui";
import { measureTextWidth } from "metabase/lib/measure-text";

import type { ChartFont } from "../../types/style";

import type { RowChartProps } from "./RowChart";
import { RowChart } from "./RowChart";
import type { RowChartTheme } from "./types";

type TestDatum = { y: string; x: number; x1: number };

const testFont: ChartFont = {
  size: 10,
  family: "Lato",
  weight: 400,
  color: "grey",
};

const theme: RowChartTheme = {
  axis: { color: "gray", ticks: testFont, label: testFont },
  dataLabels: testFont,
  goal: { lineStroke: "gray", label: testFont },
  grid: {
    color: "gray",
  },
};

const series1 = {
  seriesKey: "series 1",
  seriesName: "Series 1",
  xAccessor: (datum: TestDatum) => datum.x,
  yAccessor: (datum: TestDatum) => datum.y,
};
const series2 = {
  seriesKey: "series 2",
  seriesName: "Series 2",
  xAccessor: (datum: TestDatum) => datum.x1,
  yAccessor: (datum: TestDatum) => datum.y,
};

const defaultProps = {
  width: 1000,
  height: 1000,
  data: [
    { y: "foo", x: 100, x1: 200 },
    { y: "bar", x: 200, x1: 400 },
    { y: "baz", x: 300, x1: 600 },
  ],
  series: [series1, series2],
  seriesColors: {
    "series 1": "red",
    "series 2": "green",
  },
  theme,
  stackOffset: null,
  measureTextWidth,
};

const setup = (props?: Partial<RowChartProps<TestDatum>>) => {
  const { container } = render(<RowChart {...defaultProps} {...props} />);
  const bars = screen
    .getAllByRole("graphics-symbol")
    .filter(el => el.getAttribute("aria-roledescription") === "bar");
  const dataLabels = screen.queryAllByTestId("data-label");
  const goalLine = screen
    .queryAllByRole("graphics-symbol")
    .find(el => el.getAttribute("aria-roledescription") === "goal line");

  const xTicks = Array.from(
    container // eslint-disable-line testing-library/no-container
      .getElementsByClassName("visx-axis-bottom")[0] // eslint-disable-line testing-library/no-node-access
      ?.getElementsByTagName("tspan") || [], // eslint-disable-line testing-library/no-node-access
  ).map(tspan => tspan.textContent);

  const yTicks = Array.from(
    container // eslint-disable-line testing-library/no-container
      .getElementsByClassName("visx-axis-left")[0] // eslint-disable-line testing-library/no-node-access
      ?.getElementsByTagName("tspan") || [], // eslint-disable-line testing-library/no-node-access
  ).map(tspan => tspan.textContent);

  return {
    bars,
    dataLabels,
    goalLine,
    xTicks,
    yTicks,
  };
};

describe("RowChart", () => {
  describe("axes", () => {
    it("should render Y-ticks", () => {
      const { yTicks } = setup({ series: [series1] });

      expect(yTicks).toStrictEqual(["foo", "bar", "baz"]);
    });

    it("should not render Y-ticks when disabled", () => {
      const { yTicks } = setup({
        series: [series1],
        hasYAxis: false,
      });

      expect(yTicks).toStrictEqual([]);
    });

    it("should render the last tick", () => {
      const { xTicks } = setup({ series: [series1], xValueRange: [0, 1] });
      expect(xTicks).toStrictEqual([
        "0",
        "0.1",
        "0.2",
        "0.3",
        "0.4",
        "0.5",
        "0.6",
        "0.7",
        "0.8",
        "0.9",
        "1",
      ]);
    });

    it("should render nice values for X-ticks", () => {
      const { xTicks } = setup({ series: [series1] });

      expect(xTicks).toStrictEqual([
        "0",
        "50",
        "100",
        "150",
        "200",
        "250",
        "300",
      ]);
    });

    it("should not render X-ticks when disabled", () => {
      const { xTicks } = setup({
        series: [series1],
        hasXAxis: false,
      });

      expect(xTicks).toStrictEqual([]);
    });

    it("should apply formatting", () => {
      const { xTicks, yTicks } = setup({
        series: [series1],
        tickFormatters: {
          xTickFormatter: (value: string) => `x_${value}`,
          yTickFormatter: (value: string) => `y_${value}`,
        },
      });

      expect(xTicks).toStrictEqual([
        "x_0",
        "x_50",
        "x_100",
        "x_150",
        "x_200",
        "x_250",
        "x_300",
      ]);
      expect(yTicks).toStrictEqual(["y_foo", "y_bar", "y_baz"]);
    });

    it("should render labels when specified", () => {
      setup({
        series: [series1],
        xLabel: "X Label",
        yLabel: "Y Label",
      });

      expect(screen.getByText("X Label")).toBeInTheDocument();
      expect(screen.getByText("Y Label")).toBeInTheDocument();
    });
  });

  describe("bars", () => {
    it("should render chart bars for a single series chart", () => {
      const { bars } = setup({ series: [series1] });
      expect(bars).toHaveLength(3);
      expect(bars[0]).toHaveAttribute("aria-label", "100");
      expect(bars[1]).toHaveAttribute("aria-label", "200");
      expect(bars[2]).toHaveAttribute("aria-label", "300");
    });

    it("should render chart bars for a multi-series chart", () => {
      const { bars } = setup();
      expect(bars).toHaveLength(6);

      // Series 1
      expect(bars[0]).toHaveAttribute("aria-label", "100");
      expect(bars[1]).toHaveAttribute("aria-label", "200");
      expect(bars[2]).toHaveAttribute("aria-label", "300");

      // Series 2
      expect(bars[3]).toHaveAttribute("aria-label", "200");
      expect(bars[4]).toHaveAttribute("aria-label", "400");
      expect(bars[5]).toHaveAttribute("aria-label", "600");
    });
  });

  describe("data labels", () => {
    it("should not render data labels when not specified", () => {
      const { dataLabels } = setup();
      expect(dataLabels).toHaveLength(0);
    });

    it("should render data labels for specified series", () => {
      const { dataLabels } = setup({ labelledSeries: ["series 1"] });
      expect(dataLabels.map(el => el.textContent)).toStrictEqual([
        "100",
        "200",
        "300",
      ]);
    });

    it("should render formatted data labels when enabled", () => {
      const { dataLabels } = setup({
        labelledSeries: ["series 1"],
        labelsFormatter: (value: NumberValue) => `_${value}_`,
      });
      expect(dataLabels.map(el => el.textContent)).toStrictEqual([
        "_100_",
        "_200_",
        "_300_",
      ]);
    });
  });

  describe("goal line", () => {
    it("should not render goal line when not specified", () => {
      const { goalLine } = setup();
      expect(goalLine).toBeFalsy();
    });

    it("should render goal line when specified", () => {
      const { goalLine } = setup({ goal: { label: "Goal label", value: 100 } });
      expect(goalLine?.textContent).toBe("Goal label");
    });
  });

  describe("events", () => {
    it("should call onClick with the clicked datum info", async () => {
      const onClick = jest.fn();

      const { bars } = setup({ onClick });
      await userEvent.click(bars[0]);

      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.anything() }),
        expect.objectContaining({
          datum: expect.objectContaining({ x: 100, x1: 200, y: "foo" }),
          series: expect.objectContaining({
            seriesKey: "series 1",
            seriesName: "Series 1",
          }),
          datumIndex: 0,
          isNegative: false,
        }),
      );

      onClick.mockClear();

      // the last bar
      await userEvent.click(bars[5]);

      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.anything() }),
        expect.objectContaining({
          datum: expect.objectContaining({ x: 300, x1: 600, y: "baz" }),
          series: expect.objectContaining({
            seriesKey: "series 2",
            seriesName: "Series 2",
          }),
          datumIndex: 2,
          isNegative: false,
        }),
      );
    });

    it("should call onHover with the clicked datum info", async () => {
      const onHover = jest.fn();

      const { bars } = setup({ onHover });
      await userEvent.hover(bars[0]);

      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.anything() }),
        expect.objectContaining({
          datum: expect.objectContaining({ x: 100, x1: 200, y: "foo" }),
          series: expect.objectContaining({
            seriesKey: "series 1",
            seriesName: "Series 1",
          }),
          datumIndex: 0,
          isNegative: false,
        }),
      );

      onHover.mockClear();

      // the last bar
      await userEvent.click(bars[5]);

      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.anything() }),
        expect.objectContaining({
          datum: expect.objectContaining({ x: 300, x1: 600, y: "baz" }),
          series: expect.objectContaining({
            seriesKey: "series 2",
            seriesName: "Series 2",
          }),
          datumIndex: 2,
          isNegative: false,
        }),
      );
    });

    it("should highlight all bars of hovered series when multi-series", () => {
      const hoveredData = {
        seriesIndex: 1,
        datumIndex: 1,
      };

      const { bars } = setup({ hoveredData });
      const firstSeriesBars = bars.slice(0, 3);
      const secondSeriesBars = bars.slice(3);

      firstSeriesBars.forEach(bar =>
        expect(bar).toHaveAttribute("opacity", "0.4"),
      );

      secondSeriesBars.forEach(bar =>
        expect(bar).toHaveAttribute("opacity", "1"),
      );
    });

    it("should highlight only hovered bar when single-series", () => {
      const hoveredData = {
        seriesIndex: 0,
        datumIndex: 1,
      };

      const { bars } = setup({ hoveredData, series: [series1] });

      expect(bars.map(bar => bar.getAttribute("opacity"))).toStrictEqual([
        "0.4",
        "1",
        "0.4",
      ]);
    });
  });
});
