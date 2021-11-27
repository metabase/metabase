import { YAxisPosition } from "./../types";
import { calculateLegendItems } from "./legend";

const width = 500;
const lineHeight = 10;

const defaultColor = "#509ee3";

const createSeries = ({
  name = "line",
  color = defaultColor,
  yAxisPosition = "left",
}: {
  name?: string;
  color?: string;
  yAxisPosition?: YAxisPosition;
} = {}) => {
  return {
    name,
    color,
    yAxisPosition,
    type: "line" as const,
    data: [] as any,
  };
};

describe("calculateLegendItems", () => {
  it("returns no legend items for a single series", () => {
    const series = [createSeries()];
    const { leftItems, rightItems, height } = calculateLegendItems(
      series,
      width,
      lineHeight,
    );

    expect(leftItems).not.toBeDefined();
    expect(rightItems).not.toBeDefined();
    expect(height).toBe(0);
  });

  it("returns left column items for two series that use a single Y-axis", () => {
    const series = [
      createSeries({ name: "line 1", yAxisPosition: "right" }),
      createSeries({ name: "line 2", yAxisPosition: "right" }),
    ];
    const { leftItems, rightItems, height } = calculateLegendItems(
      series,
      width,
      lineHeight,
    );

    expect(leftItems).toStrictEqual([
      { color: "#509ee3", label: "line 1", top: 0 },
      { color: "#509ee3", label: "line 2", top: 10 },
    ]);
    expect(rightItems).not.toBeDefined();
    expect(height).toBe(20);
  });

  it("returns two column multiple series that use both Y-axes", () => {
    const series = [
      createSeries({ name: "line right 1", yAxisPosition: "right" }),
      createSeries({ name: "line right 2", yAxisPosition: "right" }),
      createSeries({ name: "line right 3", yAxisPosition: "right" }),
      createSeries({ name: "line left 1", yAxisPosition: "left" }),
      createSeries({ name: "line left 2", yAxisPosition: "left" }),
    ];
    const { leftItems, rightItems, height } = calculateLegendItems(
      series,
      width,
      lineHeight,
    );

    expect(leftItems).toStrictEqual([
      { color: "#509ee3", label: "line left 1", top: 0 },
      { color: "#509ee3", label: "line left 2", top: 10 },
    ]);

    expect(rightItems).toStrictEqual([
      { color: "#509ee3", label: "line right 1", top: 0 },
      { color: "#509ee3", label: "line right 2", top: 10 },
      { color: "#509ee3", label: "line right 3", top: 20 },
    ]);

    expect(height).toBe(30);
  });
});
