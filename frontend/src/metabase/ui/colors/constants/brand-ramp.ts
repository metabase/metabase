import { getBaseColorsForThemeDefinitionOnly } from "./base-colors";

const baseColors = getBaseColorsForThemeDefinitionOnly();

const RAMP_STOPS = [
  100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5,
] as const satisfies readonly (keyof typeof baseColors.brand)[];

export const BRAND_RAMP_TO_OCEAN: Record<string, string> = Object.fromEntries(
  RAMP_STOPS.map((stop) => [baseColors.brand[stop], baseColors.ocean[stop]]),
);

/** Swaps brand ramp values for the matching Ocean stops. */
export const resolveBrandRampToOcean = (colors: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [
      key,
      BRAND_RAMP_TO_OCEAN[value] ?? value,
    ]),
  );
