import {
  ECHARTS_CATEGORY_AXIS_NULL_VALUE,
  INDEX_KEY,
  X_AXIS_DATA_KEY,
  X_AXIS_POSITION_KEY,
} from "../constants/dataset";

import type { CategoryXAxisModel, ChartDataset } from "./types";
import { appendXAxisPositions, getXAxisPositions } from "./x-axis-position";

const axisModel: CategoryXAxisModel = {
  axisType: "category",
  isDashboard: true,
  isHistogram: false,
  valuesCount: 4,
  formatter: String,
};

describe("categorical X-axis positions", () => {
  it("assigns repeated categories the same position without changing source indices", () => {
    const dataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: "B", [INDEX_KEY]: 7, count: 10 },
      { [X_AXIS_DATA_KEY]: "A", [INDEX_KEY]: 2, count: 20 },
      { [X_AXIS_DATA_KEY]: "B", [INDEX_KEY]: 3, count: 30 },
    ];
    const positions = getXAxisPositions(dataset, axisModel);
    const positionedDataset = appendXAxisPositions(dataset, positions);

    expect(positions?.values).toEqual(["B", "A"]);
    expect(positionedDataset).toEqual([
      { ...dataset[0], [X_AXIS_POSITION_KEY]: 0 },
      { ...dataset[1], [X_AXIS_POSITION_KEY]: 1 },
      { ...dataset[2], [X_AXIS_POSITION_KEY]: 0 },
    ]);
    expect(dataset.every((datum) => !(X_AXIS_POSITION_KEY in datum))).toBe(
      true,
    );
  });

  it("uses the canonical category positions for sparse auxiliary datasets", () => {
    const dataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: "A" },
      { [X_AXIS_DATA_KEY]: ECHARTS_CATEGORY_AXIS_NULL_VALUE },
      { [X_AXIS_DATA_KEY]: "" },
      { [X_AXIS_DATA_KEY]: "B" },
    ];
    const positions = getXAxisPositions(dataset, axisModel);
    const auxiliaryDataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: "B", count: 20 },
      { [X_AXIS_DATA_KEY]: ECHARTS_CATEGORY_AXIS_NULL_VALUE, count: 10 },
    ];

    expect(appendXAxisPositions(auxiliaryDataset, positions)).toEqual([
      { ...auxiliaryDataset[0], [X_AXIS_POSITION_KEY]: 3 },
      { ...auxiliaryDataset[1], [X_AXIS_POSITION_KEY]: 1 },
    ]);
  });

  it("leaves unrecognized auxiliary categories unplottable", () => {
    const positions = getXAxisPositions(
      [{ [X_AXIS_DATA_KEY]: "A" }, { [X_AXIS_DATA_KEY]: "B" }],
      axisModel,
    );

    expect(
      appendXAxisPositions([{ [X_AXIS_DATA_KEY]: "C" }], positions),
    ).toEqual([{ [X_AXIS_DATA_KEY]: "C", [X_AXIS_POSITION_KEY]: null }]);
  });

  it("preserves the dataset outside dashboards", () => {
    const dataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: "A" },
      { [X_AXIS_DATA_KEY]: "B" },
    ];
    const positions = getXAxisPositions(dataset, {
      ...axisModel,
      isDashboard: false,
    });

    expect(positions).toBeUndefined();
    expect(appendXAxisPositions(dataset, positions)).toBe(dataset);
  });

  it.each([{ values: [] }, { values: ["A"] }, { values: ["A", "A"] }])(
    "preserves the dataset when there are fewer than two categories: $values",
    ({ values }) => {
      const dataset = values.map((value) => ({ [X_AXIS_DATA_KEY]: value }));
      const positions = getXAxisPositions(dataset, axisModel);

      expect(positions).toBeUndefined();
      expect(appendXAxisPositions(dataset, positions)).toBe(dataset);
    },
  );
});
