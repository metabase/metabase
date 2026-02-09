import { measureTextWidth } from "./text";

const fontSize = 11;

describe("measureTextWidth", () => {
  it("should measure text", () => {
    expect(Math.round(measureTextWidth("abc", fontSize))).toBe(17);
  });
});
