import type { MantineTheme } from "metabase/ui";

import {
  getMetabaseSdkCssVariables,
  getMetabaseThemeCssVariables,
  getThemeSpecificCssVariables,
} from "./css-variables";

const LIGHT_COLORS: Record<string, string> = {
  "background_page-primary": "#ffffff",
  "background-primary": "#ffffff",
  "text-primary": "#111111",
  border: "#dcdfe0",
  brand: "#509ee3",
};

const DARK_COLORS: Record<string, string> = {
  ...LIGHT_COLORS,
  "background_page-primary": "#111111",
  "background-primary": "#111111",
  "text-primary": "#ffffff",
};

const createTheme = (
  colors: Record<string, string>,
  other: object = {},
): MantineTheme =>
  // Unjustified type cast. FIXME
  ({
    other,
    fn: { themeColor: (name: string) => colors[name] ?? name },
  }) as unknown as MantineTheme;

const TOOLBAR_CSS_VARIABLE = "--mb-color-bg-sdk-question-toolbar";

// The color the light dynamic config derives from a white background.
const DERIVED_TOOLBAR_COLOR = "rgb(245, 245, 245)";

describe("getThemeSpecificCssVariables", () => {
  it("returns the correct CSS variables", () => {
    const theme = createTheme(LIGHT_COLORS, {
      dashboard: {
        backgroundColor: "red",
        card: {
          backgroundColor: "purple",
        },
      },
    });

    const styles = getThemeSpecificCssVariables(theme).styles;

    expect(styles).toContain("--mb-color-bg-dashboard: red;");
    expect(styles).toContain("--mb-color-bg-dashboard-card: purple;");
  });
});

describe("getMetabaseThemeCssVariables", () => {
  it("returns the theme options and the colors derived from the palette", () => {
    const theme = createTheme(LIGHT_COLORS, {
      dashboard: { backgroundColor: "red" },
    });

    const styles = getMetabaseThemeCssVariables(theme).styles;

    expect(styles).toContain("--mb-color-bg-dashboard: red;");
    expect(styles).toContain(`--mb-color-notebook-step-bg:`);
  });

  it("returns the derived toolbar color after the one from the theme options", () => {
    const theme = createTheme(LIGHT_COLORS, {
      question: { toolbar: { backgroundColor: "purple" } },
    });

    const styles = getMetabaseThemeCssVariables(theme).styles;

    expect(
      styles.indexOf(`${TOOLBAR_CSS_VARIABLE}: ${DERIVED_TOOLBAR_COLOR};`),
    ).toBeGreaterThan(styles.indexOf(`${TOOLBAR_CSS_VARIABLE}: purple;`));
  });
});

describe("getMetabaseSdkCssVariables", () => {
  const getStyles = (colors: Record<string, string>, other: object = {}) =>
    getMetabaseSdkCssVariables({
      theme: createTheme(colors, other),
      font: "Lato",
    }).styles;

  it("returns the font, the palette and the design system colors", () => {
    const styles = getStyles(LIGHT_COLORS);

    expect(styles).toContain(
      '--mb-default-font-family: "Lato", Arial, sans-serif;',
    );
    expect(styles).toContain("--mb-color-background-primary:");
    expect(styles).toContain("--mb-color-brand: #509ee3;");
  });

  it("returns the dark palette when the theme background is dark", () => {
    expect(getStyles(DARK_COLORS)).not.toEqual(getStyles(LIGHT_COLORS));
  });

  it("returns the toolbar color from the theme options after the derived one", () => {
    const styles = getStyles(LIGHT_COLORS, {
      question: { toolbar: { backgroundColor: "purple" } },
    });

    expect(styles.indexOf(`${TOOLBAR_CSS_VARIABLE}: purple;`)).toBeGreaterThan(
      styles.indexOf(`${TOOLBAR_CSS_VARIABLE}: ${DERIVED_TOOLBAR_COLOR};`),
    );
  });
});
