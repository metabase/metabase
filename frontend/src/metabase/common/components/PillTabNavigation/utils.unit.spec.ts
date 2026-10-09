import { getTabCount } from "./utils";

describe("getTabCount", () => {
  it("retains a resolved count while a background refresh is pending", () => {
    expect(getTabCount({ value: 42, isError: false })).toEqual({
      status: "loaded",
      value: 42,
    });
  });

  it.each([
    { value: undefined, isError: false, expected: { status: "loading" } },
    { value: 0, isError: false, expected: { status: "loaded", value: 0 } },
    { value: undefined, isError: true, expected: { status: "error" } },
    { value: 42, isError: true, expected: { status: "error" } },
  ])(
    "maps value=$value and isError=$isError to $expected",
    ({ value, isError, expected }) => {
      expect(getTabCount({ value, isError })).toEqual(expected);
    },
  );
});
