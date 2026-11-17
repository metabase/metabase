import { getLineAreaBarComparisonSettings } from "./settings";

describe("getLineAreaBarComparisonSettings", () => {
  it("compares duration settings, so series in different units do not share axis", () => {
    const seconds = getLineAreaBarComparisonSettings({
      number_style: "duration",
      duration_unit: "second",
      column_title: "Seconds",
    });
    const minutes = getLineAreaBarComparisonSettings({
      number_style: "duration",
      duration_unit: "minute",
      column_title: "Minutes",
    });

    expect(seconds).toEqual({
      number_style: "duration",
      duration_unit: "second",
    });
    expect(minutes).not.toEqual(seconds);
  });
});
