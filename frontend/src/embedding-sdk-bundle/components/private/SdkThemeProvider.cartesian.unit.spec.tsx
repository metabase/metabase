import { renderWithProviders, screen } from "__support__/ui";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import type { MetabaseEmbeddingTheme } from "metabase/embedding-sdk/theme";
import { getMetabaseSdkCssVariables } from "metabase/styled-components/theme/css-variables";
import { useMantineTheme } from "metabase/ui";
import { METABASE_DARK_THEME, METABASE_LIGHT_THEME } from "metabase/ui/colors";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";

import { SdkThemeProvider } from "./SdkThemeProvider";

const LIGHT_AXIS_COLOR = METABASE_LIGHT_THEME.colors["chart-axis"];
const DARK_AXIS_COLOR = METABASE_DARK_THEME.colors["chart-axis"];

function CartesianThemeProbe() {
  const theme = useMantineTheme();
  const { getColor, theme: visualizationTheme } = useBrowserRenderingContext({
    fontFamily: "Lato",
  });
  const variables = getMetabaseSdkCssVariables({ theme, font: "Lato" });
  const axisCssColor = Array.from(
    variables.styles.matchAll(/--mb-color-chart-axis:\s*([^;]+);/g),
  ).at(-1)?.[1];

  return (
    <>
      <output data-testid="axis-color">{getColor("chart-axis")}</output>
      <output data-testid="css-axis-color">{axisCssColor}</output>
      <output data-testid="gridline-color">
        {visualizationTheme.cartesian.splitLine.lineStyle.color}
      </output>
      <output data-testid="tick-font-size">
        {visualizationTheme.cartesian.ticks.fontSize}
      </output>
      <output data-testid="variables">{variables.styles}</output>
    </>
  );
}

function setup(theme?: MetabaseEmbeddingTheme) {
  return renderWithProviders(
    <SdkThemeProvider theme={theme}>
      <CartesianThemeProbe />
    </SdkThemeProvider>,
  );
}

describe("SDK Cartesian colors", () => {
  beforeEach(() => {
    ensureMetabaseProviderPropsStore().cleanup();
  });

  it.each<{
    name: string;
    theme?: MetabaseEmbeddingTheme;
    axisColor: string;
  }>([
    { name: "default", axisColor: LIGHT_AXIS_COLOR },
    {
      name: "light preset",
      theme: { preset: "light" },
      axisColor: LIGHT_AXIS_COLOR,
    },
    {
      name: "dark preset",
      theme: { preset: "dark" },
      axisColor: DARK_AXIS_COLOR,
    },
    {
      name: "dark V1 background",
      theme: { colors: { background: "#111111" } },
      axisColor: DARK_AXIS_COLOR,
    },
    {
      name: "dark V2 background",
      theme: { version: 2, colors: { "background_page-primary": "#111111" } },
      axisColor: DARK_AXIS_COLOR,
    },
    {
      name: "explicit V2 chart axis",
      theme: { version: 2, colors: { "chart-axis": "#456789" } },
      axisColor: "#456789",
    },
    {
      name: "V2 chart axis overriding a border color",
      theme: {
        version: 2,
        colors: { border: "#123456", "chart-axis": "#456789" },
      },
      axisColor: "#456789",
    },
  ])("shares the axis token in the $name theme", ({ theme, axisColor }) => {
    setup(theme);

    expect(screen.getByTestId("axis-color")).toHaveTextContent(axisColor);
    expect(screen.getByTestId("gridline-color")).toHaveTextContent(
      "var(--mb-color-chart-axis)",
    );
    expect(screen.getByTestId("css-axis-color")).toHaveTextContent(axisColor);
    expect(screen.getByTestId("variables")).not.toHaveTextContent(
      "--mb-color-cartesian-grid-line",
    );
  });

  it.each<{
    name: string;
    theme: MetabaseEmbeddingTheme;
    gridlineColor: string;
  }>([
    {
      name: "light V1",
      theme: { colors: { border: "#123456" } },
      gridlineColor: "rgba(18, 52, 86, 0.5)",
    },
    {
      name: "dark V1",
      theme: { colors: { border: "#123456", background: "#111111" } },
      gridlineColor: "#123456",
    },
    {
      name: "light V2",
      theme: { version: 2, colors: { border: "#123456" } },
      gridlineColor: "rgba(18, 52, 86, 0.5)",
    },
    {
      name: "dark V2",
      theme: {
        version: 2,
        colors: { border: "#123456", "background_page-primary": "#111111" },
      },
      gridlineColor: "#123456",
    },
  ])("preserves custom borders in $name", ({ theme, gridlineColor }) => {
    setup(theme);

    expect(screen.getByTestId("axis-color")).toHaveTextContent("#123456");
    expect(screen.getByTestId("gridline-color")).toHaveTextContent(
      gridlineColor,
    );
    expect(screen.getByTestId("css-axis-color")).toHaveTextContent("#123456");
  });

  it("keeps gridline overrides separate from axis colors and font sizes", () => {
    setup({
      colors: { border: "#123456" },
      components: {
        cartesian: {
          label: { fontSize: "18px" },
          splitLine: { lineStyle: { color: "#abcdef" } },
        },
      },
    });

    expect(screen.getByTestId("axis-color")).toHaveTextContent("#123456");
    expect(screen.getByTestId("gridline-color")).toHaveTextContent("#abcdef");
    expect(screen.getByTestId("tick-font-size")).toHaveTextContent("18");
  });

  it("restores defaults when a customer removes their border override", () => {
    const { rerender } = setup({ colors: { border: "#123456" } });

    expect(screen.getByTestId("axis-color")).toHaveTextContent("#123456");

    rerender(
      <SdkThemeProvider theme={{}}>
        <CartesianThemeProbe />
      </SdkThemeProvider>,
    );

    expect(screen.getByTestId("axis-color")).toHaveTextContent(
      LIGHT_AXIS_COLOR,
    );
    expect(screen.getByTestId("css-axis-color")).toHaveTextContent(
      LIGHT_AXIS_COLOR,
    );
    expect(screen.getByTestId("gridline-color")).toHaveTextContent(
      "var(--mb-color-chart-axis)",
    );
  });
});
