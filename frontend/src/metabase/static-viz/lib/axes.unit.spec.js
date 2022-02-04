import { getRotatedXTickHeight, getXTickWidth, getYTickWidth } from "./axes";

const fontSize = 11;

describe("getXTickWidth", () => {
  it("should get tick width for x axis assuming 6px char width", () => {
    const data = [{ x: 1 }, { x: 200 }, { x: 15 }];
    const accessors = { x: d => d.x };
    const maxWidth = 20;

    const xTickHeight = getXTickWidth(data, accessors, maxWidth, fontSize);

    expect(Math.round(xTickHeight)).toBe(15);
  });
});

describe("getRotatedXTickHeight", () => {
  it("should get tick height by width assuming 45deg rotation", () => {
    expect(getRotatedXTickHeight(12)).toBe(9);
  });
});

describe("getYTickWidth", () => {
  it("should get tick width for y axis assuming 6px char width", () => {
    const data = [{ y: 1 }, { y: 20 }, { y: 15 }];
    const accessors = { y: d => d.y };

    const yTickHeight = getYTickWidth(data, accessors, null, fontSize);

    expect(Math.round(yTickHeight)).toBe(10);
  });
});
