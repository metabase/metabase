// eslint-disable-next-line no-restricted-imports
import { ThemeProvider as _CompatibilityEmotionThemeProvider } from "@emotion/react";
import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import { merge } from "icepick";
import { type ReactNode, useContext, useMemo } from "react";

import type { ColorName } from "metabase/ui/colors/types";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import { getCspNonce } from "metabase/utils/csp";
import type { ColorSettings } from "metabase-types/api";

import { getThemeOverrides } from "../../../theme";
import { useColorScheme } from "../ColorSchemeProvider";
import { DatesProvider } from "../DatesProvider";

import { ThemeProviderContext } from "./context";

export interface ThemeProviderProps {
  children: ReactNode;

  /**
   * Extend Metabase's theme overrides.
   * This is primarily used in the React embedding SDK
   * to allow SDK users to customize the theme.
   */
  theme?: MantineThemeOverride;

  /**
   * Resolved color scheme to use. If not provided, reads from ColorSchemeContext.
   */
  resolvedColorScheme?: ResolvedColorScheme;

  /**
   * Whitelabel color settings. If not provided, defaults to undefined (no whitelabel).
   */
  whitelabelColors?: ColorSettings | null;

  /**
   * Callback invoked when whitelabel colors should be updated.
   */
  onUpdateWhitelabelColors?: (colors: ColorSettings) => void;

  /**
   * CSS selector for Mantine CSS variables injection.
   */
  cssVariablesSelector?: string;
}

export const ThemeProvider = ({
  children,
  theme: themeOverride,
  resolvedColorScheme: resolvedColorSchemeProp,
  whitelabelColors,
  onUpdateWhitelabelColors,
  cssVariablesSelector,
}: ThemeProviderProps) => {
  const colorSchemeContext = useColorScheme();
  const resolvedColorScheme =
    resolvedColorSchemeProp ?? colorSchemeContext.resolvedColorScheme;

  const theme = useMemo(() => {
    const baseTheme = merge(
      getThemeOverrides(resolvedColorScheme, whitelabelColors),
      themeOverride,
    ) as MantineTheme;

    return {
      ...baseTheme,
      other: {
        ...baseTheme.other,
        ...(onUpdateWhitelabelColors && {
          updateColorSettings: onUpdateWhitelabelColors,
        }),
      },
      fn: {
        themeColor: (color: ColorName): string => {
          const { primaryShade, primaryColor } = baseTheme;

          return color in baseTheme.colors
            ? baseTheme.colors[color][primaryShade as number]
            : baseTheme.colors[primaryColor as ColorName][
                primaryShade as number
              ];
        },
      },
    } as MantineTheme;
  }, [
    themeOverride,
    resolvedColorScheme,
    whitelabelColors,
    onUpdateWhitelabelColors,
  ]);

  const { withCssVariables, withGlobalClasses } =
    useContext(ThemeProviderContext);

  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={resolvedColorScheme}
      getStyleNonce={() => getCspNonce() ?? "metabase"}
      classNamesPrefix="mb-mantine"
      cssVariablesSelector={cssVariablesSelector}
      withCssVariables={withCssVariables}
      withGlobalClasses={withGlobalClasses}
    >
      <_CompatibilityEmotionThemeProvider theme={theme}>
        <DatesProvider>{children}</DatesProvider>
      </_CompatibilityEmotionThemeProvider>
    </MantineProvider>
  );
};
