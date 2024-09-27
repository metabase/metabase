import { ThemeProvider as _CompatibilityEmotionThemeProvider } from "@emotion/react";
import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import { merge } from "icepick";
import { type ReactNode, useMemo } from "react";

import { getThemeOverrides } from "../../../theme";
import { themeColor } from "../../../utils/colors";
import { DatesProvider } from "../DatesProvider";

interface ThemeProviderProps {
  children: ReactNode;

  /**
   * Extend Metabase's theme overrides.
   * This is primarily used in the React embedding SDK
   * to allow SDK users to customize the theme.
   */
  theme?: MantineThemeOverride;
}

export const ThemeProvider = (props: ThemeProviderProps) => {
  // Merge default theme overrides with user-provided theme overrides
  const theme = useMemo(() => {
    const theme = merge(getThemeOverrides(), props.theme);

    return {
      ...theme,
      fn: {
        themeColor: (colorName: string) =>
          themeColor(colorName, theme as MantineTheme),
      },
    } as MantineTheme;
  }, [props.theme]);

  return (
    <MantineProvider
      theme={theme}
      getStyleNonce={() => window.MetabaseNonce ?? "metabase"}
    >
      <_CompatibilityEmotionThemeProvider theme={theme}>
        <DatesProvider>{props.children}</DatesProvider>
      </_CompatibilityEmotionThemeProvider>
    </MantineProvider>
  );
};
