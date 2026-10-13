import { scaleLinear } from "@visx/scale";

import type { GoalStyle } from "../../../types/style";

import { getRowChartGoal } from "./layout";

const GOAL_STYLE: GoalStyle = {
  lineStroke: "black",
  label: { size: 13, family: "Lato", weight: 400, color: "black" },
};

const LABEL_WIDTH = 40;

// the goal sits 50px from the right edge of the plot
const X_SCALE = scaleLinear({ domain: [0, 100], range: [0, 500] });
const GOAL = { label: "Target", value: 90 };

const measureTextWidth = () => LABEL_WIDTH;

describe("getRowChartGoal", () => {
  it("puts the label on the right when it fits there", () => {
    expect(
      getRowChartGoal(GOAL, GOAL_STYLE, measureTextWidth, X_SCALE)?.position,
    ).toBe("right");
  });

  it("puts the label on the left when the label and its adornment do not fit on the right", () => {
    expect(
      getRowChartGoal(GOAL, GOAL_STYLE, measureTextWidth, X_SCALE, 20)
        ?.position,
    ).toBe("left");
  });
});
