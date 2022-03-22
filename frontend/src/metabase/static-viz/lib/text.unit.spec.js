import { measureText, truncateText } from "./text";

const fontSize = 11;

describe("measureText", () => {
  it("should measure text assuming 6px char width", () => {
    expect(Math.round(measureText("abc", fontSize))).toBe(15);
  });
});

describe("truncateText", () => {
  it("should not truncate text with ellipses if there is no overflow", () => {
    expect(truncateText("John Doe", 48, fontSize)).toBe("John Doe");
  });

  it("should truncate text with ellipses if there is overflow", () => {
    expect(truncateText("John Doe", 40, fontSize)).toBe("John D…");
  });

  it("should use ellipses in case there is no space for text at all", () => {
    expect(truncateText("John Doe", 0, fontSize)).toBe("…");
  });
});
