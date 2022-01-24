import { calculateBounds } from "./bounds";

describe("calculateBounds", () => {
  it("calculates inner chart bounds from size and margin", () => {
    const { xMin, xMax, yMin, yMax, innerHeight, innerWidth } = calculateBounds(
      {
        top: 5,
        left: 5,
        right: 5,
        bottom: 5,
      },
      100,
      100,
    );

    expect(xMin).toBe(5);
    expect(xMax).toBe(95);

    expect(yMin).toBe(95);
    expect(yMax).toBe(5);

    expect(innerWidth).toBe(90);
    expect(innerHeight).toBe(90);
  });
});
