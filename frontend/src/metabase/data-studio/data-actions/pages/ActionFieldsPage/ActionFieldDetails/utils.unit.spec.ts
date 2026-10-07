import { textToOptions } from "./utils";

describe("textToOptions", () => {
  it("should filter duplicates", () => {
    expect(textToOptions("1\n2\n1\n1\n2")).toEqual(["1", "2"]);
  });

  it("should filter empty values and trim empty space", () => {
    expect(textToOptions(" \n  1\n2 \n\n\n  ")).toEqual(["1", "2"]);
  });
});
