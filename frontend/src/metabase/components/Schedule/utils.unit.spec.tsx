import { combineConsecutiveStrings } from "./utils";

describe("combineConsecutiveStrings", () => {
  it("should combine consecutive strings into one", () => {
    const input = ["hello", "world", 42, "foo", "bar", null, "baz"];
    const expectedOutput = ["hello world", 42, "foo bar", null, "baz"];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle arrays without consecutive strings correctly", () => {
    const input = [42, "hello", null, undefined, "world"];
    const expectedOutput = [42, "hello", null, undefined, "world"];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle an empty array correctly", () => {
    const input: any[] = [];
    const expectedOutput: any[] = [];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle an array with only one type of element correctly", () => {
    const input = ["hello", "world", "foo", "bar"];
    const expectedOutput = ["hello world foo bar"];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle an array with no strings correctly", () => {
    const input = [42, null, undefined, true, false];
    const expectedOutput = [42, null, undefined, true, false];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });

  it("should handle array with consecutive and non-consecutive strings correctly", () => {
    const input = ["one", "two", 3, "four", "five", 6, "seven"];
    const expectedOutput = ["one two", 3, "four five", 6, "seven"];
    expect(combineConsecutiveStrings(input)).toEqual(expectedOutput);
  });
});
