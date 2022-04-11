import { CHART_PADDING } from "metabase/static-viz/components/XYChart/constants";
import { calculateMargin, LABEL_OFFSET } from "./margin";

const COMPUTED_TEXT_HEIGHT = 50;

jest.mock("metabase/static-viz/lib/text", () => ({
  measureTextHeight: () => COMPUTED_TEXT_HEIGHT,
}));

describe("calculateMargin", () => {
  it("calculates chart margins based on ticks dimensions without labels", () => {
    const leftYTickWidth = 100;
    const rightYTickWidth = 200;
    const xTickHeight = 300;
    const xTickWidth = 20;
    const labelFontSize = 11;

    const labels = {};

    const { top, left, bottom, right } = calculateMargin(
      leftYTickWidth,
      rightYTickWidth,
      xTickHeight,
      xTickWidth,
      labels,
      labelFontSize,
    );

    expect(top).toBe(CHART_PADDING);
    expect(left).toBe(leftYTickWidth + CHART_PADDING);
    expect(right).toBe(rightYTickWidth + CHART_PADDING);
    expect(bottom).toBe(xTickHeight + CHART_PADDING);
  });

  it("calculates chart margins based on ticks and labels dimensions", () => {
    const leftYTickWidth = 100;
    const rightYTickWidth = 200;
    const xTickHeight = 300;
    const xTickWidth = 20;
    const labelFontSize = 11;

    const labels = { left: "left label", right: "right label" };

    const { top, left, bottom, right } = calculateMargin(
      leftYTickWidth,
      rightYTickWidth,
      xTickHeight,
      xTickWidth,
      labels,
      labelFontSize,
    );

    expect(top).toBe(CHART_PADDING);
    expect(left).toBe(
      leftYTickWidth + CHART_PADDING + COMPUTED_TEXT_HEIGHT + LABEL_OFFSET,
    );
    expect(right).toBe(
      rightYTickWidth + CHART_PADDING + COMPUTED_TEXT_HEIGHT + LABEL_OFFSET,
    );
    expect(bottom).toBe(xTickHeight + CHART_PADDING);
  });
});
