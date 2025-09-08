import { scaleLinear } from "@visx/scale";

import { addScalePadding } from "./scale";

describe("addScalePadding", () => {
  it("should not mutate the original scale", () => {
    const originalScale = scaleLinear({
      domain: [0, 100],
      range: [0, 500],
    });

    const originalRange = [...originalScale.range()];
    const originalDomain = [...originalScale.domain()];

    const paddedScale = addScalePadding(originalScale, 10, 20);

    expect(originalScale.range()).toEqual(originalRange);
    expect(originalScale.domain()).toEqual(originalDomain);

    expect(paddedScale.range()).toEqual([10, 480]);
    expect(paddedScale).not.toBe(originalScale);
  });
});
