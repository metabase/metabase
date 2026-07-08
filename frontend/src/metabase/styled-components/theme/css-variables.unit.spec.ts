import type { MantineTheme, MantineThemeOverride } from "metabase/ui";
import { deriveFullMetabaseTheme } from "metabase/ui/colors";
import { METABASE_DARK_THEME } from "metabase/ui/colors/constants/themes/dark";
import { METABASE_LIGHT_THEME } from "metabase/ui/colors/constants/themes/light";
import type {
  ColorName,
  MetabaseEmbeddingThemeV2,
} from "metabase/ui/colors/types";
import { getThemeOverrides } from "metabase/ui/theme";
import { getColorShades } from "metabase/ui/utils/colors";

import {
  getMetabaseSdkCssVariables,
  getThemeSpecificCssVariables,
} from "./css-variables";

const createTheme = (overrides: MantineThemeOverride) => {
  const theme = overrides as MantineTheme;

  theme.fn = {
    themeColor: (color: ColorName) =>
      theme.colors[color]?.[0] ??
      theme.colors[theme.primaryColor as ColorName][
        theme.primaryShade as number
      ],
  } as MantineTheme["fn"];

  return theme;
};

const createV2ThemeOverride = (
  embeddingThemeOverride: MetabaseEmbeddingThemeV2,
): MantineThemeOverride => {
  const baseTheme = getThemeOverrides("light");
  const derivedTheme = deriveFullMetabaseTheme({
    colorScheme: "light",
    embeddingThemeOverride,
  });

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...Object.fromEntries(
        Object.entries(derivedTheme.colors).map(([name, value]) => [
          name,
          getColorShades(value),
        ]),
      ),
    },
  };
};

const getSdkCssVariableStyles = (theme: MantineTheme) =>
  getMetabaseSdkCssVariables({ theme, font: "Inter" }).styles;

describe("getThemeSpecificCssVariables", () => {
  it("returns the correct CSS variables", () => {
    const theme = {
      other: {
        dashboard: {
          backgroundColor: "red",
          card: {
            backgroundColor: "purple",
          },
        },
      },
    } as MantineTheme;

    const styles = getThemeSpecificCssVariables(theme).styles;

    expect(styles).toContain("--mb-color-bg-dashboard: red;");
    expect(styles).toContain("--mb-color-bg-dashboard-card: purple;");
  });
});

describe("getMetabaseSdkCssVariables", () => {
  it("uses light base color variables when the resolved palette is light", () => {
    const theme = createTheme(getThemeOverrides("light"));

    const styles = getSdkCssVariableStyles(theme);

    expect(styles).toContain(
      `--mb-color-background_page-primary-inverse: ${METABASE_LIGHT_THEME.colors["background_page-primary-inverse"]};`,
    );
  });

  it("uses dark base color variables when the resolved V1 palette is dark", () => {
    const theme = createTheme(getThemeOverrides("dark"));

    const styles = getSdkCssVariableStyles(theme);

    expect(styles).toContain(
      `--mb-color-background_page-primary-inverse: ${METABASE_DARK_THEME.colors["background_page-primary-inverse"]};`,
    );
  });

  it("uses dark base color variables when the resolved V2 palette is dark", () => {
    const embeddingThemeOverride = {
      version: 2,
      colors: {
        "background_page-primary": "#111111",
        "text-primary": "#ffffff",
      },
    } as MetabaseEmbeddingThemeV2;

    const theme = createTheme(createV2ThemeOverride(embeddingThemeOverride));

    const styles = getSdkCssVariableStyles(theme);

    expect(styles).toContain(
      `--mb-color-background_page-primary-inverse: ${METABASE_DARK_THEME.colors["background_page-primary-inverse"]};`,
    );
  });
});
