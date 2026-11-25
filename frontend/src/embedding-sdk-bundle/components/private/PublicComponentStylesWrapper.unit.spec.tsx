import { render, screen } from "@testing-library/react";

import { ThemeProvider } from "metabase/ui";

import {
  PublicComponentStylesWrapper,
  SCOPED_CSS_RESET,
} from "./PublicComponentStylesWrapper";

const setup = (resolvedColorScheme: "light" | "dark") =>
  render(
    <ThemeProvider resolvedColorScheme={resolvedColorScheme}>
      <PublicComponentStylesWrapper data-testid="wrapper">
        <span>content</span>
      </PublicComponentStylesWrapper>
    </ThemeProvider>,
  );

describe("PublicComponentStylesWrapper", () => {
  it("inherits the parent MantineProvider's light color scheme", () => {
    setup("light");
    expect(screen.getByTestId("wrapper")).toHaveAttribute(
      "data-mantine-color-scheme",
      "light",
    );
  });

  it("inherits the parent MantineProvider's dark color scheme (EMB-1560)", () => {
    setup("dark");
    expect(screen.getByTestId("wrapper")).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark",
    );
  });

  it("applies the theme's font size", () => {
    render(
      <ThemeProvider theme={{ other: { fontSize: "18px" } }}>
        <PublicComponentStylesWrapper data-testid="wrapper" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("wrapper")).toHaveStyle({
      "--public-component-font-size": "18px",
    });
  });

  it("keeps every reset rule when parsed as plain CSS", () => {
    const style = document.createElement("style");
    style.textContent = SCOPED_CSS_RESET;
    document.head.appendChild(style);

    const rules = Array.from(style.sheet?.cssRules ?? []).map((rule) =>
      rule instanceof CSSStyleRule ? rule.selectorText : rule.cssText,
    );
    style.remove();

    expect(rules).toEqual([
      ":where(.mb-wrapper) *:where(button)",
      ":where(.mb-wrapper) *:where(ul)",
      ":where(.mb-wrapper) *:where(svg)",
      expect.stringMatching(/^@supports \(-webkit-touch-callout: none\)/),
    ]);
  });
});
