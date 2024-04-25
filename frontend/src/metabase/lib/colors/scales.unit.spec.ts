import { color } from "./palette";
import { getColorScale } from "./scales";

describe("scales", () => {
  const colors = [color("white"), color("black")];

  it("should interpolate colors by default", () => {
    const scale = getColorScale([0, 1], colors);

    expect(scale(0.2).toUpperCase()).not.toEqual(colors[0]);
    expect(scale(0.8).toUpperCase()).not.toEqual(colors[1]);
  });

  it("should not interpolate colors when specified", () => {
    const scale = getColorScale([0, 1], colors, true);

    expect(scale(0.2).toUpperCase()).toEqual(colors[0]);
    expect(scale(0.8).toUpperCase()).toEqual(colors[1]);
  });
});
