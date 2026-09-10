import {
  LIGHT_COLORS,
  createTheme,
} from "metabase/styled-components/theme/__support__/theme";

import { getMetabaseSdkCssVariables } from "./css-variables";

describe("SDK theme CSS variables", () => {
  it("uses customer component colors after colors derived from the palette", () => {
    const theme = createTheme(LIGHT_COLORS, {
      question: {
        backgroundColor: "transparent",
        toolbar: { backgroundColor: "purple" },
      },
    });
    const styles = getMetabaseSdkCssVariables({ theme, font: "Lato" }).styles;
    const custom = styles.indexOf(
      "--mb-color-bg-sdk-question-toolbar: purple;",
    );
    const derived = styles.indexOf(
      "--mb-color-bg-sdk-question-toolbar: rgb(245, 245, 245);",
    );
    expect(derived).toBeGreaterThanOrEqual(0);
    expect(custom).toBeGreaterThan(derived);
    expect(styles).toContain(
      '--mb-default-font-family: "Lato", Arial, sans-serif;',
    );
    expect(styles).toContain("--mb-color-brand: #509ee3;");
  });

  it("selects the palette from the normalized customer background", () => {
    const light = getMetabaseSdkCssVariables({
      theme: createTheme(),
      font: "Lato",
    }).styles;
    const dark = getMetabaseSdkCssVariables({
      theme: createTheme({
        ...LIGHT_COLORS,
        "background_page-primary": "#111111",
        "background-primary": "#111111",
      }),
      font: "Lato",
    }).styles;
    expect(dark).not.toEqual(light);
    expect(dark).toContain(
      "--mb-color-bg-sdk-question-toolbar: rgb(26, 26, 26);",
    );
  });
});
