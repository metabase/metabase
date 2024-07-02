import { removeNullAndUndefinedValues } from "./types";

describe("removeNullAndUndefinedValues", () => {
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
    expect(removeNullAndUndefinedValues(obj)).toEqual(keepers);
  });
});
