// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";

import type { MantineTheme } from "metabase/ui";

import {
  getDefaultFontFamilyCssVariable,
  getMetabaseCssVariables,
  getPaletteCssVariables,
} from "./css-variables";

// Unjustified type cast. FIXME
const theme = {
  fontFamilyMonospace: "Monaco, monospace",
  other: { colorScheme: "light" },
} as MantineTheme;

describe("getPaletteCssVariables", () => {
  it("returns a CSS variable for each color of the resolved palette", () => {
    expect(getPaletteCssVariables("light")).toContain(
      "--mb-color-background-primary:",
    );
  });

  it("returns different values for the light and the dark color scheme", () => {
    expect(getPaletteCssVariables("light")).not.toEqual(
      getPaletteCssVariables("dark"),
    );
  });

  it("returns the whitelabel color when one is set", () => {
    const styles = getPaletteCssVariables("light", { brand: "#ff0000" });

    expect(styles).toContain("--mb-color-brand: #ff0000;");
    expect(styles).toContain("--mb-color-core-brand: #ff0000;");
  });
});

describe("getDefaultFontFamilyCssVariable", () => {
  it("returns the font stack of the given font", () => {
    expect(getDefaultFontFamilyCssVariable("Lato")).toBe(
      '--mb-default-font-family: "Lato", Arial, sans-serif;',
    );
  });
});

describe("getMetabaseCssVariables", () => {
  it("returns the monospace font and the palette of the theme color scheme", () => {
    const { styles } = getMetabaseCssVariables({ theme });

    expect(styles).toContain(
      "--mb-default-monospace-font-family:Monaco, monospace;",
    );
    expect(styles).toContain("--mb-color-background-primary:");
  });

  it("returns the palette of the dark color scheme when the theme is dark", () => {
    // Unjustified type cast. FIXME
    const darkTheme = {
      ...theme,
      other: { colorScheme: "dark" },
    } as MantineTheme;

    expect(getMetabaseCssVariables({ theme: darkTheme }).styles).not.toEqual(
      getMetabaseCssVariables({ theme }).styles,
    );
  });

  it("returns the given theme CSS variables after the palette", () => {
    const { styles } = getMetabaseCssVariables({
      theme,
      themeCssVariables: css`
        --mb-color-bg-dashboard: red;
      `,
    });

    expect(styles.indexOf("--mb-color-bg-dashboard:red;")).toBeGreaterThan(
      styles.indexOf("--mb-color-background-primary:"),
    );
  });
});
