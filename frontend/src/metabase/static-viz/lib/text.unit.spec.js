import { measureText } from "./text";

describe("measureText", () => {
  it("should measure text assuming 6px char width", () => {
    expect(measureText("abc")).toBe(18);
  });
});
