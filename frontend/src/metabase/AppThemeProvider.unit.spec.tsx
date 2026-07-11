import { renderWithProviders, screen } from "__support__/ui";
import { useColorScheme } from "metabase/ui";

import { AppThemeProvider } from "./AppThemeProvider";

// Witness for metabase#61741: pivot tables (and all content) in static embedding's
// dark mode had white cell backgrounds because the "night" display theme was not
// applied. The embed theme ("night", from the iframe hash #theme=night or the
// displayTheme prop) is resolved to a color scheme by AppThemeProvider. If "night"
// fails to resolve to "dark", the resolved color scheme stays light, the
// visualization theme's colorScheme is not "dark", and PivotTable's
// getCellBackgroundColor returns the light (white) branch instead of the dark one.
//
// AppThemeProvider's resolution helper is not exported, so we pin the behavior
// through its public seam: passing displayTheme and reading the resolved color
// scheme that reaches children via the ColorScheme context.

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
    // This is the assertion that discriminates the bug: night embed theme must map
    // to the dark color scheme so dashboards/pivot tables render dark, not white.
    setup("night");
    expect(screen.getByTestId("resolved-color-scheme")).toHaveTextContent(
      "dark",
    );
  });

  it.each([
    ["dark", "dark"],
    ["light", "light"],
    ["transparent", "light"],
  ])("resolves the %s display theme to the %s color scheme", (theme, scheme) => {
    setup(theme);
    expect(screen.getByTestId("resolved-color-scheme")).toHaveTextContent(
      scheme,
    );
  });
});
