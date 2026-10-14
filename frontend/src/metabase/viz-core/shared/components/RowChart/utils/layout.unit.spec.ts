import { scaleLinear } from "@visx/scale";

import type { GoalStyle } from "../../../types/style";
import { GOAL_WARNING_WIDTH } from "../../VerticalGoalLine/goal-warning";

import { getGoalLinePadding, getRowChartGoal } from "./layout";

const GOAL_STYLE: GoalStyle = {
  lineStroke: "black",
  label: { size: 13, family: "Lato", weight: 400, color: "black" },
};

const PLOT_WIDTH = 500;
const X_SCALE = scaleLinear({
  domain: [0, PLOT_WIDTH],
  range: [0, PLOT_WIDTH],
});
const GOAL = { label: "Target", value: 450 };
const SPACE_RIGHT_OF_GOAL = PLOT_WIDTH - GOAL.value;
const LABEL_WIDTH = SPACE_RIGHT_OF_GOAL - GOAL_WARNING_WIDTH / 2;

const measureTextWidth = () => LABEL_WIDTH;

describe("getRowChartGoal", () => {
  it("puts the label on the right when it fits there", () => {
    expect(
      getRowChartGoal(GOAL, GOAL_STYLE, measureTextWidth, X_SCALE)?.position,
    ).toBe("right");
  });

  it("puts the label on the left when the label and its warning do not fit on the right", () => {
    expect(
      getRowChartGoal(GOAL, GOAL_STYLE, measureTextWidth, X_SCALE, true)
        ?.position,
    ).toBe("left");
  });
});

describe("getGoalLinePadding", () => {
  it("leaves room for the goal label", () => {
    expect(getGoalLinePadding(GOAL_STYLE, false)).toBe(14);
  });

  it("leaves room for a warning taller than the goal label", () => {
    expect(getGoalLinePadding(GOAL_STYLE, true)).toBe(16);
  });
});
