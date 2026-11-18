import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { useMantineTheme } from "@mantine/core";
import Color from "color";

import { render, screen } from "__support__/ui";
import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/ui/component-theme";
import { getThemeOverrides } from "metabase/ui/theme";
import { getColorShades } from "metabase/ui/utils/colors";

import { Text } from "../..";

import { ThemeProvider } from "./ThemeProvider";

// TODO: Add substitute tests since we can't test CSS custom properties with JSDom
// eslint-disable-next-line jest/no-disabled-tests
describe.skip("ThemeProvider", () => {
  const OVERRIDES = getThemeOverrides();

  it("applies the metabase theme overrides", () => {
    render(
      <ThemeProvider>
        <Text size="xl">Text</Text>
      </ThemeProvider>,
    );

    const textCss = window.getComputedStyle(screen.getByText("Text"));
    expect(textCss.getPropertyValue("font-size")).toBe(OVERRIDES.fontSizes!.xl);

    const defaultColor = OVERRIDES.colors?.["text-primary"]?.[0];
    expect(textCss.getPropertyValue("color")).toBe(
      Color(defaultColor).rgb().string(),
    );
  });

  it("merges the theme overrides when the theme prop is provided", () => {
    // Simulate a user-provided theme override.
    // This is primarily used by the React embedding SDK.
    const theme: MantineThemeOverride = {
      colors: { "text-primary": getColorShades("rgb(12, 34, 56)") },
    };

    render(
      <ThemeProvider theme={theme}>
        <Text size="xl">Text</Text>
      </ThemeProvider>,
    );

    const textCss = window.getComputedStyle(screen.getByText("Text"));

    // Metabase theme overrides should still be preserved.
    expect(textCss.getPropertyValue("font-size")).toBe(OVERRIDES.fontSizes!.xl);

    // Theme overrides from the user should be applied.
    expect(textCss.getPropertyValue("color")).toBe("rgb(12, 34, 56)");
  });
});

describe("ThemeProvider theme override", () => {
  const METABASE_THEME = getThemeOverrides();

  const readTheme = (theme?: MantineThemeOverride) => {
    let result: MantineTheme | undefined;
    const Reader = () => {
      result = useMantineTheme();
      return null;
    };

    render(
      <ThemeProvider theme={theme}>
        <Reader />
      </ThemeProvider>,
    );

    if (!result) {
      throw new Error("Theme was not read");
    }
    return result;
  };

  it("uses the Metabase theme when no override is given", () => {
    const theme = readTheme();

    expect(theme.primaryColor).toBe(METABASE_THEME.primaryColor);
    expect(theme.fontSizes.xl).toBe(METABASE_THEME.fontSizes!.xl);
    expect(theme.colors["text-primary"]).toEqual(
      METABASE_THEME.colors!["text-primary"],
    );
    expect(theme.other.popover.zIndex).toBe(
      DEFAULT_METABASE_COMPONENT_THEME.popover.zIndex,
    );
  });

  it("replaces primitives and colour tuples from the override", () => {
    const tuple = getColorShades("rgb(12, 34, 56)");
    const theme = readTheme({
      primaryColor: "text-primary",
      fontFamily: "Comic Sans MS",
      colors: { "text-primary": tuple },
    });

    expect(theme.primaryColor).toBe("text-primary");
    expect(theme.fontFamily).toBe("Comic Sans MS");
    expect(theme.colors["text-primary"]).toEqual(tuple);
  });

  it("keeps Metabase values the override does not mention", () => {
    const theme = readTheme({ fontFamily: "Comic Sans MS" });

    expect(theme.fontSizes.xl).toBe(METABASE_THEME.fontSizes!.xl);
    expect(theme.primaryColor).toBe(METABASE_THEME.primaryColor);
    expect(theme.colors["text-secondary"]).toEqual(
      METABASE_THEME.colors!["text-secondary"],
    );
    expect(theme.components.Popover.defaultProps.radius).toBe("md");
  });

  it("merges nested objects key by key", () => {
    const tuple = getColorShades("rgb(12, 34, 56)");
    const portalProps = { target: "#sdk-root" };
    const theme = readTheme({
      fontFamily: "Comic Sans MS",
      colors: { "text-primary": tuple },
      other: { popover: { zIndex: 9999 } },
      components: {
        Popover: { defaultProps: { portalProps } },
      },
    });

    expect(theme.fontFamily).toBe("Comic Sans MS");
    expect(theme.colors["text-primary"]).toEqual(tuple);
    expect(theme.colors["text-secondary"]).toEqual(
      METABASE_THEME.colors!["text-secondary"],
    );
    expect(theme.other.popover.zIndex).toBe(9999);
    expect(theme.other.collectionBrowser).toEqual(
      METABASE_THEME.other!.collectionBrowser,
    );
    expect(theme.components.Popover.defaultProps.portalProps).toEqual(
      portalProps,
    );
    expect(theme.components.Popover.defaultProps.radius).toBe("md");
    expect(theme.components.Popover.defaultProps.withinPortal).toBe(true);
  });
});
