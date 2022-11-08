import React from "react";
import { render } from "@testing-library/react";
import type { NumberValue } from "d3-scale";
import userEvent from "@testing-library/user-event";
import { ChartFont } from "../../types/style";
import { FontStyle, TextMeasurer } from "../../types/measure-text";
import { RowChart, RowChartProps } from "./RowChart";
import { RowChartTheme } from "./types";

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

const measureText: TextMeasurer = (text: string, style: FontStyle) =>
  text.length * 10;

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
  measureText,
};

const setup = (props?: Partial<RowChartProps<TestDatum>>) => {
  const {
    getAllByRole,
    getByText,
    getAllByText,
    queryByText,
    queryAllByTestId,
    queryAllByRole,
  } = render(<RowChart {...defaultProps} {...props} />);
  const bars = getAllByRole("graphics-symbol").filter(
    el => el.getAttribute("aria-roledescription") === "bar",
  );
  const dataLabels = queryAllByTestId("data-label");
  const goalLine = queryAllByRole("graphics-symbol").find(
    el => el.getAttribute("aria-roledescription") === "goal line",
  );

  return {
    queryAllByTestId,
    getAllByText,
    getByText,
    queryByText,

    bars,
    dataLabels,
    goalLine,
  };
};

describe("RowChart", () => {
  describe("axes", () => {
    it("should render Y-ticks", () => {
      const { getByText } = setup({ series: [series1] });

      const ticks = ["foo", "bar", "baz"];
      ticks.forEach(tick => expect(getByText(tick)).toBeInTheDocument());
    });

    it("should not render Y-ticks when disabled", () => {
      const { queryByText } = setup({
        series: [series1],
        hasYAxis: false,
      });
      expect(queryByText("foo")).toBeNull();
    });

    it("should render nice values for X-ticks ", () => {
      const { getAllByText } = setup({ series: [series1] });
      const ticks = ["0", "50", "100", "150", "200", "250"];

      // visx duplicates certain ticks
      ticks.forEach(tick => expect(getAllByText(tick)[0]).toBeInTheDocument());
    });

    it("should not render X-ticks when disabled", () => {
      const { queryByText } = setup({
        series: [series1],
        hasXAxis: false,
      });
      expect(queryByText("50")).toBeNull();
    });

    it("should apply formatting", () => {
      const { getAllByText } = setup({
        series: [series1],
        tickFormatters: {
          xTickFormatter: (value: string) => `x_${value}`,
          yTickFormatter: (value: string) => `y_${value}`,
        },
      });

      const ticks = [
        "y_foo",
        "y_bar",
        "y_baz",
        "x_0",
        "x_50",
        "x_100",
        "x_150",
        "x_200",
        "x_250",
      ];

      // visx duplicates certain ticks
      ticks.forEach(tick => expect(getAllByText(tick)[0]).toBeInTheDocument());
    });

    it("should render labels when specified", () => {
      const { getByText } = setup({
        series: [series1],
        xLabel: "X Label",
        yLabel: "Y Label",
      });

      expect(getByText("X Label")).toBeInTheDocument();
      expect(getByText("Y Label")).toBeInTheDocument();
    });
  });

  describe("bars", () => {
    it("should render chart bars for a single series chart", () => {
      const { bars } = setup({ series: [series1] });
      expect(bars).toHaveLength(3);
      expect(bars[0].getAttribute("aria-label")).toBe("100");
      expect(bars[1].getAttribute("aria-label")).toBe("200");
      expect(bars[2].getAttribute("aria-label")).toBe("300");
    });

    it("should render chart bars for a multi-series chart", () => {
      const { bars } = setup();
      expect(bars).toHaveLength(6);

      // Series 1
      expect(bars[0].getAttribute("aria-label")).toBe("100");
      expect(bars[1].getAttribute("aria-label")).toBe("200");
      expect(bars[2].getAttribute("aria-label")).toBe("300");

      // Series 2
      expect(bars[3].getAttribute("aria-label")).toBe("200");
      expect(bars[4].getAttribute("aria-label")).toBe("400");
      expect(bars[5].getAttribute("aria-label")).toBe("600");
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
    it("should call onClick with the clicked datum info", () => {
      const onClick = jest.fn();

      const { bars } = setup({ onClick });
      userEvent.click(bars[0]);

      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({ currentTarget: expect.anything() }),
        0, // first series
        0, // first bar
      );

      onClick.mockClear();

      // the last bar
      userEvent.click(bars[5]);

      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({ currentTarget: expect.anything() }),
        1, // second series
        2, // third bar
      );
    });

    it("should call onClick with the clicked datum info", () => {
      const onHover = jest.fn();

      const { bars } = setup({ onHover });
      userEvent.hover(bars[0]);

      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ currentTarget: expect.anything() }),
        0, // first series
        0, // first bar
      );

      onHover.mockClear();

      // the last bar
      userEvent.click(bars[5]);

      expect(onHover).toHaveBeenCalledWith(
        expect.objectContaining({ currentTarget: expect.anything() }),
        1, // second series
        2, // third bar
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
        expect(bar.getAttribute("opacity")).toBe("0.4"),
      );

      secondSeriesBars.forEach(bar =>
        expect(bar.getAttribute("opacity")).toBe("1"),
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
