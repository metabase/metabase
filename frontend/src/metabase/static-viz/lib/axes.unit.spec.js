import { getXTickHeight, getYTickWidth } from "./axes";

describe("getXTickHeight", () => {
  it("should get tick height assuming 6px char width and 45deg rotation", () => {
    const data = [{ x: 1 }, { x: 20 }, { x: 15 }];
    const accessors = { x: d => d.x };

    const xTickHeight = getXTickHeight(data, accessors);

    expect(xTickHeight).toBe(9);
  });
});

describe("getYTickWidth", () => {
  it("should get tick width assuming 6px char width and horizontal alignment", () => {
    const data = [{ y: 1 }, { y: 20 }, { y: 15 }];
    const accessors = { y: d => d.y };

    const yTickHeight = getYTickWidth(data, accessors);

    expect(yTickHeight).toBe(12);
  });
});
