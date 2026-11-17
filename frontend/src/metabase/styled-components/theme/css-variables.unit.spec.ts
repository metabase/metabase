import type { MantineTheme } from "metabase/ui";
import { getBaseColorsForThemeDefinitionOnly } from "metabase/ui/colors/constants/base-colors";

import {
  getMetabaseSdkCssVariables,
  getThemeSpecificCssVariables,
} from "./css-variables";

const baseColors = getBaseColorsForThemeDefinitionOnly();

// `text-brand` is defined off `brand[50]`, so it is dynamic or Ocean depending on
// whether a brand color is in play.
const TEXT_BRAND_RAMP = baseColors.brand[50];
const TEXT_BRAND_OCEAN = baseColors.ocean[50];

const createSdkTheme = (colors: Record<string, string>) =>
  // The helpers under test read only these fields off the theme, so a stub carrying
  // them stands in for a full Mantine theme.
  ({
    fontFamilyMonospace: "monospace",
    fn: {
      themeColor: (name: string) => colors[name] ?? "#ffffff",
    },
    other: {},
  }) as MantineTheme;

describe("getThemeSpecificCssVariables", () => {
  it("returns the correct CSS variables", () => {
    // Unjustified type cast. FIXME
    const theme = {
      other: {
        dashboard: {
          backgroundColor: "red",
          card: {
            backgroundColor: "purple",
          },
        },
      },
    } as MantineTheme;

    const styles = getThemeSpecificCssVariables(theme).styles;

    expect(styles).toContain("--mb-color-bg-dashboard: red;");
    expect(styles).toContain("--mb-color-bg-dashboard-card: purple;");
  });
});

describe("getMetabaseSdkCssVariables", () => {
  it("keeps the brand ramp dynamic when forceDynamicBrandRamp is set", () => {
    const styles = getMetabaseSdkCssVariables({
      theme: createSdkTheme({ "core-brand": "#DF75E9" }),
      font: "Lato",
      forceDynamicBrandRamp: true,
    }).styles;

    expect(styles).toContain(`--mb-color-text-brand: ${TEXT_BRAND_RAMP};`);
    expect(styles).not.toContain(`--mb-color-text-brand: ${TEXT_BRAND_OCEAN};`);
  });

  it("replaces the brand ramp with Ocean when forceDynamicBrandRamp is not set", () => {
    const styles = getMetabaseSdkCssVariables({
      theme: createSdkTheme({}),
      font: "Lato",
    }).styles;

    expect(styles).toContain(`--mb-color-text-brand: ${TEXT_BRAND_OCEAN};`);
  });
});
