import { LIGHT_COLORS, createTheme } from "./__support__/theme";
import {
  getMetabaseCssVariables,
  getPaletteCssVariables,
  getThemeSpecificCssVariables,
} from "./css-variables";

describe("component theme CSS variables", () => {
  it("maps component defaults without SDK initialization", () => {
    const styles = getMetabaseCssVariables({ theme: createTheme() }).styles;
    expect(styles).toContain(
      "--mb-color-bg-dashboard: var(--mb-color-background_page-primary);",
    );
    expect(styles).toContain("--mb-overlay-z-index: 200;");
    expect(styles).toContain("--mb-color-notebook-step-bg:");
  });

  it("preserves zero-valued component options", () => {
    const styles = getThemeSpecificCssVariables(
      createTheme(LIGHT_COLORS, { popover: { zIndex: 0 } }),
    ).styles;
    expect(styles).toContain("--mb-overlay-z-index: 0;");
  });

  it("applies whitelabel colors to the palette", () => {
    expect(getPaletteCssVariables("light", { brand: "#ff0000" })).toContain(
      "--mb-color-brand: #ff0000;",
    );
  });

  it("keeps derived toolbar colors after component options in the main app", () => {
    const theme = createTheme(LIGHT_COLORS, {
      question: {
        backgroundColor: "transparent",
        toolbar: { backgroundColor: "purple" },
      },
    });
    const styles = getMetabaseCssVariables({ theme }).styles;
    const custom = styles.indexOf(
      "--mb-color-bg-sdk-question-toolbar: purple;",
    );
    const derived = styles.indexOf(
      "--mb-color-bg-sdk-question-toolbar: rgb(245, 245, 245);",
    );
    expect(custom).toBeGreaterThanOrEqual(0);
    expect(derived).toBeGreaterThan(custom);
  });
});
