import { compareParameterValues } from "./DashboardData";

describe("DashboardData > compareParameterValues", () => {
  it("should return true if the values are the same", () => {
    expect(
      compareParameterValues(
        {
          "param-1": "foo",
          "param-2": 2,
          "param-3": true,
          "param-4": ["foo", "bar"],
        },
        {
          "param-1": "foo",
          "param-2": 2,
          "param-3": true,
          "param-4": ["foo", "bar"],
        },
      ),
    ).toBe(true);
  });

  it("should return false if the values are different", () => {
    expect(
      compareParameterValues(
        {
          "param-1": "foo",
          "param-2": 2,
          "param-3": true,
          "param-4": ["foo", "bar"],
        },
        {
          "param-1": "bar",
          "param-2": 4,
          "param-3": false,
          "param-4": ["baz", "foo"],
        },
      ),
    ).toBe(false);
  });

  it("should treat undefined values as equal to null", () => {
    expect(compareParameterValues({}, { "param-1": null })).toBe(true);
  });

  it("shouldn't treat null as falsy value", () => {
    expect(
      compareParameterValues({ "param-1": null }, { "param-1": false }),
    ).toBe(false);

    expect(compareParameterValues({ "param-1": null }, { "param-1": 0 })).toBe(
      false,
    );
  });
});
