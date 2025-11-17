import type { MantineThemeOverride } from "@mantine/core";
import Color from "color";

import { render, screen } from "__support__/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import { getColorShades } from "metabase/ui/utils/colors";

import { Text } from "../..";

import { ThemeProvider } from "./ThemeProvider";

// TODO: Add substitute tests since we can't test CSS custom properties with JSDom
// eslint-disable-next-line jest/no-disabled-tests
describe.skip("ThemeProvider", () => {
  const OVERRIDES = getThemeOverrides();

  it("applies the metabase theme overrides", () => {
    render(
      <ThemeProvider>
        <Text size="xl">Text</Text>
      </ThemeProvider>,
    );

    const textCss = window.getComputedStyle(screen.getByText("Text"));
    expect(textCss.getPropertyValue("font-size")).toBe(OVERRIDES.fontSizes!.xl);

    const defaultColor = OVERRIDES.colors?.["text-primary"]?.[0];
    expect(textCss.getPropertyValue("color")).toBe(
      Color(defaultColor).rgb().string(),
    );
  });

  it("merges the theme overrides when the theme prop is provided", () => {
    // Simulate a user-provided theme override.
    // This is primarily used by the React embedding SDK.
    const theme: MantineThemeOverride = {
      colors: { "text-primary": getColorShades("rgb(12, 34, 56)") },
    };

    render(
      <ThemeProvider theme={theme}>
        <Text size="xl">Text</Text>
      </ThemeProvider>,
    );

    const textCss = window.getComputedStyle(screen.getByText("Text"));

    // Metabase theme overrides should still be preserved.
    expect(textCss.getPropertyValue("font-size")).toBe(OVERRIDES.fontSizes!.xl);

    // Theme overrides from the user should be applied.
    expect(textCss.getPropertyValue("color")).toBe("rgb(12, 34, 56)");
  });
});
