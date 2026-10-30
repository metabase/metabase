import { textToOptions } from "./utils";

describe("textToOptions", () => {
  it("should filter duplicates", () => {
    expect(textToOptions("1\n2\n1\n1\n2", "string")).toEqual(["1", "2"]);
  });

  it("should filter empty values and trim empty space", () => {
    expect(textToOptions(" \n  1\n2 \n\n\n  ", "string")).toEqual(["1", "2"]);
  });

  it("should convert number options and drop the ones that are not numbers", () => {
    expect(textToOptions("1\nabc\n2.5\n01", "number")).toEqual([1, 2.5]);
  });
});
