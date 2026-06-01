import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import type { ClickObject } from "metabase/visualizations/types";
import { createMockColumn } from "metabase-types/api/mocks";

import { getClickedSliceName } from "./use-chart-events";

const categoryColumn = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
});
const revenueColumn = createMockColumn({
  name: "sum",
  display_name: "Revenue",
});

function createChartModel(): PieChartModel {
  return {
    total: 830288.75,
    numRings: 1,
    colDescs: {
      dimensionDesc: { column: categoryColumn, index: 0 },
      metricDesc: { column: revenueColumn, index: 1 },
    },
    sliceTree: new Map([
      [
        "Widget",
        {
          key: "Widget",
          name: "Widget",
          value: 423667.5,
          rawValue: 423667.5,
          normalizedPercentage: 0.51,
          visible: true,
          color: "#509EE3",
          startAngle: 0,
          endAngle: 180,
          children: new Map(),
          column: categoryColumn,
          rowIndex: 0,
        },
      ],
      [
        "Gadget",
        {
          key: "Gadget",
          name: "Gadget",
          value: 406621.25,
          rawValue: 406621.25,
          normalizedPercentage: 0.49,
          visible: true,
          color: "#88BF4D",
          startAngle: 180,
          endAngle: 360,
          children: new Map(),
          column: categoryColumn,
          rowIndex: 1,
        },
      ],
    ]),
  };
}

describe("getClickedSliceName", () => {
  it("finds the pie slice matching a clicked mention target", () => {
    const clicked: ClickObject = {
      value: 423667.5,
      column: revenueColumn,
      dimensions: [{ column: categoryColumn, value: "Widget" }],
    };

    expect(getClickedSliceName(createChartModel(), clicked)).toBe("Widget");
  });

  it("returns undefined when the clicked mention does not match a slice", () => {
    const clicked: ClickObject = {
      value: 123,
      column: revenueColumn,
      dimensions: [{ column: categoryColumn, value: "Unknown" }],
    };

    expect(getClickedSliceName(createChartModel(), clicked)).toBeUndefined();
  });
});
