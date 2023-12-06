import { color } from "metabase/lib/colors";

import { DEFAULT_SETTINGS, MOCK_RAW_SERIES } from "../test";
import { getPieChartModel } from ".";

const MOCK_RENDERING_CONTEXT = {
  getColor: color,
  measureText: () => 0,
  formatValue: (_: any, _2: any) => "",
  fontFamily: "",
};

describe("getPieChartModel", () => {
  it("should return the correct model object given valid 'rawSeries' and 'settings'", () => {
    const model = getPieChartModel(
      MOCK_RAW_SERIES,
      DEFAULT_SETTINGS,
      MOCK_RENDERING_CONTEXT,
    );

    expect(model).toStrictEqual({
      slices: [
        {
          color: "#88BF4D",
          key: "Doohickey",
          normalizedPercentage: 0.21,
          rowIndex: 0,
          value: 42,
        },
        {
          color: "#F9D45C",
          key: "Gadget",
          normalizedPercentage: 0.265,
          rowIndex: 1,
          value: 53,
        },
        {
          color: "#A989C5",
          key: "Gizmo",
          normalizedPercentage: 0.255,
          rowIndex: 2,
          value: 51,
        },
        {
          color: "#F2A86F",
          key: "Widget",
          normalizedPercentage: 0.27,
          rowIndex: 3,
          value: 54,
        },
      ],
      total: 200,
    });
  });
});
