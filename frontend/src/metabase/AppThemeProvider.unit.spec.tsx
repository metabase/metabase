import { renderWithProviders, screen } from "__support__/ui";
import { useColorScheme } from "metabase/ui";

import { AppThemeProvider } from "./AppThemeProvider";

const ColorSchemeProbe = () => {
  const { resolvedColorScheme } = useColorScheme();
  return <div data-testid="resolved-color-scheme">{resolvedColorScheme}</div>;
};

const setup = (displayTheme?: string) => {
  renderWithProviders(
    <AppThemeProvider displayTheme={displayTheme}>
      <ColorSchemeProbe />
    </AppThemeProvider>,
  );
};

describe("AppThemeProvider display theme resolution (metabase#61741)", () => {
  it("resolves the embed 'night' theme to the dark color scheme", () => {
    setup("night");
    expect(screen.getByTestId("resolved-color-scheme")).toHaveTextContent(
      "dark",
    );
  });

  it.each([
    ["dark", "dark"],
    ["light", "light"],
    ["transparent", "light"],
  ])(
    "resolves the %s display theme to the %s color scheme",
    (theme, scheme) => {
      setup(theme);
      expect(screen.getByTestId("resolved-color-scheme")).toHaveTextContent(
        scheme,
      );
    },
  );
});
