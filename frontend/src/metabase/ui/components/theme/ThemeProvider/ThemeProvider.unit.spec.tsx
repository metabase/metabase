import type { MantineThemeOverride } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import Color from "color";

import { getThemeOverrides } from "metabase/ui/theme";

import { Text } from "../..";

import { ThemeProvider } from "./ThemeProvider";

describe("ThemeProvider", () => {
  const OVERRIDES = getThemeOverrides();

  it("applies the metabase theme overrides", () => {
    render(
      <ThemeProvider>
        <Text size="xl">Text</Text>
      </ThemeProvider>,
    );

    const textCss = window.getComputedStyle(screen.getByText("Text"));
    expect(textCss.getPropertyValue("font-size")).toBe(OVERRIDES.fontSizes!.xl);

    const defaultColor = OVERRIDES.colors?.["text-dark"]?.[0];
    expect(textCss.getPropertyValue("color")).toBe(
      Color(defaultColor).rgb().string(),
    );
  });

  it("merges the theme overrides when the theme prop is provided", () => {
    // Simulate a user-provided theme override.
    // This is primarily used by the React embedding SDK.
    const theme: MantineThemeOverride = {
      colors: { "text-dark": ["rgb(12, 34, 56)"] },
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
