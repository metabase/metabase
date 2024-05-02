import type { MantineThemeOverride } from "@mantine/core";
import { render, screen } from "@testing-library/react";

import { Button } from "../..";

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
        <Button color="brand">Demo</Button>
      </ThemeProvider>,
    );

    const buttonLabel = screen.getByText("Demo");
    const css = window.getComputedStyle(buttonLabel);

    expect(css.getPropertyValue("color")).toBe("rgb(12, 34, 56)");
  });
});
