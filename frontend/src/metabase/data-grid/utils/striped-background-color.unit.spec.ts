import Color from "color";

import {
  DEFAULT_STRIPED_BACKGROUND_COLOR,
  getStripedBackgroundColor,
} from "./striped-background-color";

const lightness = (color: string) => Color(color).lightness();

describe("getStripedBackgroundColor", () => {
  it("uses the theme stripe color when set", () => {
    expect(
      getStripedBackgroundColor({
        stripedBackgroundColor: "#abcdef",
        cell: { backgroundColor: "#000000" },
      }),
    ).toBe("#abcdef");
  });

  it("falls back to the default when there is no cell background", () => {
    expect(getStripedBackgroundColor(undefined)).toBe(
      DEFAULT_STRIPED_BACKGROUND_COLOR,
    );
    expect(getStripedBackgroundColor({ cell: {} })).toBe(
      DEFAULT_STRIPED_BACKGROUND_COLOR,
    );
  });

  it("lightens a dark cell background", () => {
    const cellBackgroundColor = "#2f3640";
    const stripe = getStripedBackgroundColor({
      cell: { backgroundColor: cellBackgroundColor },
    });

    expect(lightness(stripe)).toBeGreaterThan(lightness(cellBackgroundColor));
    expect(Color(stripe).isDark()).toBe(true);
  });

  it("darkens a light cell background", () => {
    const cellBackgroundColor = "#ffffff";
    const stripe = getStripedBackgroundColor({
      cell: { backgroundColor: cellBackgroundColor },
    });

    expect(lightness(stripe)).toBeLessThan(lightness(cellBackgroundColor));
    expect(Color(stripe).isLight()).toBe(true);
  });

  it("falls back to the default for CSS expressions it cannot parse", () => {
    expect(
      getStripedBackgroundColor({
        cell: { backgroundColor: "var(--mb-color-background_page-primary)" },
      }),
    ).toBe(DEFAULT_STRIPED_BACKGROUND_COLOR);
  });
});
