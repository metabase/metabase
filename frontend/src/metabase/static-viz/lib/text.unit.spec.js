import { measureTextWidth, truncateText } from "./text";

const fontSize = 11;

describe("measureTextWidth", () => {
  it("should measure text", () => {
    expect(Math.round(measureTextWidth("abc", fontSize))).toBe(17);
  });
});

describe("truncateText", () => {
  it("should not truncate text with ellipses if there is no overflow", () => {
    expect(truncateText("John Doe", 48, fontSize)).toBe("John Doe");
  });

  it("should truncate text with ellipses if there is overflow", () => {
    expect(truncateText("John Doe", 48, fontSize)).toBe("John Doe");
  });

  it("should use ellipses in case there is no space for text at all", () => {
    expect(truncateText("John Doe", 0, fontSize)).toBe("…");
  });
});
