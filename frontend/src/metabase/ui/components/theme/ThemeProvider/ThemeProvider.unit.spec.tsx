import type { MantineThemeOverride } from "@mantine/core";
import { render, screen } from "@testing-library/react";

import { Text } from "../..";

import { ThemeProvider } from "./ThemeProvider";

describe("ThemeProvider", () => {
  it("merges the theme overrides when the theme prop is provided", () => {
    // Simulate a user-provided theme override.
    // This is primarily used by the React embedding SDK.
    const theme: MantineThemeOverride = {
      colors: { "text-dark": ["rgb(12, 34, 56)"] },
    };

    render(
      <ThemeProvider theme={theme}>
        <Text size="lg">Text</Text>
      </ThemeProvider>,
    );

    const textCss = window.getComputedStyle(screen.getByText("Text"));

    // Metabase theme overrides must be preserved.
    expect(textCss.getPropertyValue("line-height")).toBe("1.5rem");

    // Theme override from the user must be applied.
    expect(textCss.getPropertyValue("color")).toBe("rgb(12, 34, 56)");
  });
});
