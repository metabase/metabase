import { measureText, truncateText } from "./text";

describe("measureText", () => {
  it("should measure text assuming 6px char width", () => {
    expect(measureText("abc")).toBe(18);
  });
});

describe("truncateText", () => {
  it("should not truncate text with ellipses if there is no overflow", () => {
    expect(truncateText("John Doe", 48)).toBe("John Doe");
  });

  it("should truncate text with ellipses if there is overflow", () => {
    expect(truncateText("John Doe", 47)).toBe("John D…");
  });

  it("should use ellipses in case there is no space for text at all", () => {
    expect(truncateText("John Doe", 0)).toBe("…");
  });
});
