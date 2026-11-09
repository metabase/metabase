import { getValidGaugeSegments } from "./types";

describe("Visualizations > Gauge > types > getValidGaugeSegments", () => {
  it("keeps complete ranges when one range has an empty bound (#83439)", () => {
    const segments = [
      { min: 0, max: 5000, color: "red", label: "" },
      { min: 5000, max: 10000, color: "amber", label: "" },
      // empty Max arrives as null from the segments editor
      { min: 10000, max: null, color: "green", label: "" },
    ];

    expect(getValidGaugeSegments(segments)).toEqual([
      { min: 0, max: 5000, color: "red", label: "" },
      { min: 5000, max: 10000, color: "amber", label: "" },
    ]);
  });

  it("keeps all segments when every range is complete", () => {
    const segments = [
      { min: 0, max: 50, color: "red", label: "" },
      { min: 50, max: 100, color: "green", label: "" },
    ];

    expect(getValidGaugeSegments(segments)).toEqual(segments);
  });

  it("returns an empty array when every range is incomplete", () => {
    expect(
      getValidGaugeSegments([
        { min: null, max: 5000, color: "red", label: "" },
        { min: 5000, max: undefined, color: "green", label: "" },
      ]),
    ).toEqual([]);
  });

  it("returns an empty array for non-array settings values", () => {
    expect(getValidGaugeSegments(undefined)).toEqual([]);
    expect(getValidGaugeSegments(null)).toEqual([]);
    expect(getValidGaugeSegments({})).toEqual([]);
  });
});
