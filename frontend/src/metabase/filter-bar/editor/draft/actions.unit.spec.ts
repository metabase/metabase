import { addListValues } from "./actions";

describe("addListValues", () => {
  it.each<[unknown[], string, unknown[]]>([
    [[], "", []],
    [[], "a, b,, c", ["a", "b", "c"]],
    [["a"], "b", ["a", "b"]],
    [["a"], "a, b", ["a", "b"]],
    [["a"], "b, b", ["a", "b"]],
    [[10], "10, 20", [10, "20"]],
    [["a"], "", ["a"]],
  ])("adds %j to %j", (values, text, expected) => {
    expect(addListValues(values, text)).toEqual(expected);
  });
});
