import { render, screen } from "@testing-library/react";

import { FrontendLocaleContext } from "metabase/embedding/FrontendLocaleContext";
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

const setupWithLocale = (locale: string | null) =>
  render(
    <ThemeProvider resolvedColorScheme="light">
      <FrontendLocaleContext.Provider
        value={{ locale, isLocaleLoading: false }}
      >
        <PublicComponentStylesWrapper data-testid="wrapper">
          <span>content</span>
        </PublicComponentStylesWrapper>
      </FrontendLocaleContext.Provider>
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

  it("defaults to dir=ltr when there is no locale provider", () => {
    setup("light");
    expect(screen.getByTestId("wrapper")).toHaveAttribute("dir", "ltr");
  });

  it("scopes dir=rtl to the SDK content for an RTL locale", () => {
    setupWithLocale("ar");
    expect(screen.getByTestId("wrapper")).toHaveAttribute("dir", "rtl");
  });

  it("uses dir=ltr for an LTR locale", () => {
    setupWithLocale("en");
    expect(screen.getByTestId("wrapper")).toHaveAttribute("dir", "ltr");
  });
});
