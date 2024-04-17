import { removeNullOrUndefinedValues } from "./types";

describe("removeNullOrUndefinedValues", () => {
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
    const keepers = {
      a: 1,
      b: false,
      d: 0,
      e: "",
      f: "some string",
    };
    expect(removeNullOrUndefinedValues(obj)).toEqual(keepers);
  });
});
