import Color from "color";

import { deriveChartShadeColor, deriveChartTintColor } from "./accents";
import { getMainAccentColors } from "./groups";
import { suggestHarmonyColors } from "./harmonies";
import {
  alpha,
  darken,
  getTextColorForBackground,
  isDark,
  isLight,
  lighten,
  shade,
  tint,
  tryIsDark,
} from "./palette";

const COLOR_INPUTS = [
  "Rebeccapurple",
  "transparent",
  "#f04",
  "#abcd",
  "#AABBCC88",
  "#1C8ACE",
  "rgb(0.49, 127.9, 255)",
  "rgb(0%, 50%, 100%)",
  "rgba(12 34 56 / 45%)",
  "hsl(-90deg, 100%, 50.1%)",
  "hsla(123.45, 28.42%, 49.96%, .12345)",
  "hwb(192, 21%, 24%, .5)",
  "hwb(0, 70%, 40%)",
];

it.each(COLOR_INPUTS)(
  "retains precision and syntax when changing alpha or relative lightness of %s",
  (input) => {
    const reference = Color(input);
    expect(alpha(input, 0.12345)).toBe(reference.alpha(0.12345).string());
    expect(alpha(input, 2)).toBe(reference.alpha(2).string());
    expect(lighten(input, 0.75)).toBe(reference.lighten(0.75).string());
    expect(darken(input, 0.33)).toBe(reference.darken(0.33).string());
  },
);

it("normalizes an explicitly unset accent to black", () => {
  expect(getMainAccentColors({ accent0: undefined })[0]).toBe("#000000");
});

it.each(COLOR_INPUTS)(
  "returns uppercase opaque hex for accent colors derived from %s",
  (input) => {
    const reference = Color(input);
    const lighter = reference.lightness(reference.lightness() + 12.5).hex();
    const darker = reference.lightness(reference.lightness() - 12.5).hex();
    expect(tint(input)).toBe(lighter);
    expect(shade(input)).toBe(darker);
    expect(deriveChartTintColor(input)).toBe(lighter);
    expect(deriveChartShadeColor(input)).toBe(darker);
    expect(getMainAccentColors({ accent0: input })[0]).toBe(reference.hex());
  },
);

it.each([
  "Rebeccapurple",
  "#17bebb",
  "#aabbcc88",
  "hsla(123.45, 100%, 42%, .5)",
  "hwb(192, 21%, 24%, .5)",
])("preserves harmony rotation and hex rounding for %s", (input) => {
  const reference = Color(input);
  const values = suggestHarmonyColors(input);
  expect(values).toEqual({
    filter: reference.rotate(90).hex().toLowerCase(),
    summarize: reference.rotate(-90).hex().toLowerCase(),
    positive: reference.hue(89).lightness(50).hex().toLowerCase(),
    negative: reference.hue(359).lightness(50).hex().toLowerCase(),
    charts: [
      reference.hex().toLowerCase(),
      ...Array.from({ length: 7 }, (_, index) =>
        reference
          .rotate(45 * (index + 1))
          .hex()
          .toLowerCase(),
      ),
    ],
  });
});

it.each([
  "#7f7f7f",
  "#808080",
  "red",
  "lime",
  "rgb(128, 127.99, 128)",
  "rgb(128, 128, 128 / 0%)",
])("preserves the light/dark cutoff for %s", (input) => {
  expect(isDark(input)).toBe(Color(input).isDark());
  expect(isLight(input)).toBe(Color(input).isLight());
});

it("keeps the contrast cutoff for chart text, ignoring the background alpha", () => {
  const light = getTextColorForBackground("black");
  const dark = getTextColorForBackground("white");
  expect(light).not.toBe(dark);
  for (let channel = 0; channel <= 255; channel++) {
    const input = `rgba(${channel}, ${channel}, ${channel}, .25)`;
    const background = Color(input);
    const prefersLight =
      background.contrast(Color(light)) * 3 > background.contrast(Color(dark));
    expect(getTextColorForBackground(input)).toBe(prefersLight ? light : dark);
  }
});

it.each([
  "var(--mb-color-brand)",
  "color-mix(in srgb, red, blue)",
  "not-a-color",
  "  red  ",
])(
  "rejects unresolved or invalid input %s instead of treating it as black",
  (input) => {
    expect(() => isDark(input)).toThrow("Unable to parse color from string:");
    expect(() => suggestHarmonyColors(input)).toThrow(
      "Unable to parse color from string:",
    );
    expect(tryIsDark(input)).toBeUndefined();
  },
);
