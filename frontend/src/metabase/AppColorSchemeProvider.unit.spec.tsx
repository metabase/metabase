import { render, screen } from "@testing-library/react";

import { AppColorSchemeProvider } from "./AppColorSchemeProvider";
import { useColorScheme } from "./ui/components/theme/ColorSchemeProvider";
import type { ColorScheme } from "./utils/color-scheme";

function ColorSchemeConsumer() {
  const { colorScheme, resolvedColorScheme } = useColorScheme();
  return (
    <div>
      <span data-testid="color-scheme">{colorScheme}</span>
      <span data-testid="resolved-color-scheme">{resolvedColorScheme}</span>
    </div>
  );
}

function setSystemColorScheme(preferred: "light" | "dark") {
  window.matchMedia = ((query: string) => ({
    matches: query === `(prefers-color-scheme: ${preferred})`,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderProvider(defaultColorScheme: ColorScheme) {
  return render(
    <AppColorSchemeProvider defaultColorScheme={defaultColorScheme}>
      <ColorSchemeConsumer />
    </AppColorSchemeProvider>,
  );
}

describe("AppColorSchemeProvider", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("should react to a changed defaultColorScheme after mount (metabase#66874)", () => {
    // System prefers dark, so "auto" resolves to dark.
    setSystemColorScheme("dark");

    const { rerender } = renderProvider("auto");

    expect(screen.getByTestId("resolved-color-scheme")).toHaveTextContent(
      "dark",
    );

    // Simulate the user's stored preference ("light") arriving after login,
    // which flows in as a new `defaultColorScheme` prop without a reload.
    rerender(
      <AppColorSchemeProvider defaultColorScheme="light">
        <ColorSchemeConsumer />
      </AppColorSchemeProvider>,
    );

    expect(screen.getByTestId("color-scheme")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved-color-scheme")).toHaveTextContent(
      "light",
    );
  });
});
