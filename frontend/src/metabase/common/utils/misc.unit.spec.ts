import { removeNilValues } from "./misc";

describe("removeNilValues", () => {
  it("removes nil values from an object", () => {
    const obj = {
      a: 1,
      b: false,
      c: null,
      d: 0,
      e: "",
      f: "some string",
      g: undefined,
    };
    const nonNilValues = { a: 1, b: false, d: 0, e: "", f: "some string" };
    expect(removeNilValues(obj)).toEqual(nonNilValues);
  });
});
