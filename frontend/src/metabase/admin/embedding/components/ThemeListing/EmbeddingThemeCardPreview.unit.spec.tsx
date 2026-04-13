import { renderWithProviders, screen } from "__support__/ui";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

import { EmbeddingThemeCardPreview } from "./EmbeddingThemeCardPreview";

const TEST_THEME: MetabaseTheme = {
  fontFamily: "Roboto",
  fontSize: "14px",
  colors: {
    "background-secondary": "#f0f0f0",
    background: "#ffffff",
    "text-primary": "#223344",
    "text-secondary": "#667788",
    charts: ["#ff0000", "#00ff00", "#0000ff"],
  },
};

function setup(theme: MetabaseTheme = TEST_THEME) {
  return renderWithProviders(<EmbeddingThemeCardPreview theme={theme} />);
}

describe("EmbeddingThemeCardPreview", () => {
  it("applies the font family from the theme", () => {
    setup();

    const svg = document.querySelector("svg");
    expect(svg).toHaveStyle({ fontFamily: "Roboto" });
  });

  it("uses the background-secondary color for the card background", () => {
    setup();

    const backgroundPath = document.querySelector("path");
    expect(backgroundPath).toHaveAttribute("fill", "#f0f0f0");
  });

  it("uses the text-primary color for the heading text", () => {
    setup();

    const headingText = screen.getByText("Abc");
    expect(headingText).toHaveAttribute("fill", "#223344");
  });

  it("uses the text-primary color for the chart title text", () => {
    setup();

    const chartTitle = screen.getByText("Theme preview");
    expect(chartTitle).toHaveAttribute("fill", "#223344");
  });

  it("uses the text-secondary color for axis labels", () => {
    setup();

    const axisLabel = screen.getByText("300");
    expect(axisLabel).toHaveAttribute("fill", "#667788");
  });

  it("falls back to 'inherit' when no font family is specified", () => {
    setup({ colors: TEST_THEME.colors });

    const svg = document.querySelector("svg");
    expect(svg).toHaveStyle({ fontFamily: "inherit" });
  });
});
