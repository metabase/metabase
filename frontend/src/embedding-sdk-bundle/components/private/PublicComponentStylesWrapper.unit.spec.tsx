import { render, screen } from "@testing-library/react";

import { ThemeProvider } from "metabase/ui";

import { PublicComponentStylesWrapper } from "./PublicComponentStylesWrapper";

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
});
