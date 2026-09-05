import { color } from "metabase/ui/colors";

import { getChartColor, withColorName } from "./color-name";

describe("getChartColor", () => {
  it("keeps the stored color when no palette color was recorded", () => {
    expect(getChartColor("#123456")).toBe("#123456");
  });

  it("uses the palette color that was recorded", () => {
    expect(getChartColor("#123456", "accent2")).toBe(color("accent2"));
    expect(getChartColor("#123456", "accent2-light")).toBe(
      color("accent2-light"),
    );
    expect(getChartColor("#123456", "accent-gray")).toBe(color("accent-gray"));
  });

  it("keeps the stored color when the recorded name is not a palette color", () => {
    expect(getChartColor("#123456", "accent99")).toBe("#123456");
    expect(getChartColor("#123456", "")).toBe("#123456");
  });
});

describe("withColorName", () => {
  it("records the palette color a pick came from", () => {
    const row = { color: "#123456" };

    expect(withColorName(row, "accent2")).toEqual({
      color: "#123456",
      color_name: "accent2",
    });
  });

  it("drops a previously recorded palette color when the pick has none", () => {
    const row = { color: "#123456", color_name: "accent2" };

    expect(withColorName(row, undefined)).toStrictEqual({ color: "#123456" });
  });

  it("leaves the rest of the row alone", () => {
    const row = { key: "a", color: "#123456", defaultColor: false };

    expect(withColorName(row, "accent1")).toEqual({
      key: "a",
      color: "#123456",
      defaultColor: false,
      color_name: "accent1",
    });
  });
});
