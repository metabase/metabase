import type { MantineTheme } from "@mantine/core";
import { MantineProvider, getPrimaryShade } from "@mantine/core";
import { useContext, useMemo } from "react";

import type { ColorName } from "metabase/ui/colors/types";
import { getCspNonce } from "metabase/utils/csp";
import { deepMerge } from "metabase/utils/deep-merge";

import type { getBaseThemeOverrides } from "../../../base-theme";
import { useColorScheme } from "../ColorSchemeProvider";
import { DatesProvider } from "../DatesProvider";

import type { ThemeProviderProps } from "./ThemeProvider";
import { ThemeProviderContext } from "./context";

export const ThemeProviderBase = ({
  getThemeOverrides,
  children,
  theme: themeOverride,
  resolvedColorScheme: resolvedColorSchemeProp,
  whitelabelColors,
  onUpdateWhitelabelColors,
  cssVariablesSelector,
  forceDynamicBrandRamp,
}: ThemeProviderProps & {
  getThemeOverrides: typeof getBaseThemeOverrides;
}) => {
  const colorSchemeContext = useColorScheme();
  const resolvedColorScheme =
    resolvedColorSchemeProp ?? colorSchemeContext.resolvedColorScheme;

  const theme = useMemo(() => {
    // Unjustified type cast. FIXME
    const baseTheme = deepMerge(
      getThemeOverrides({
        colorScheme: resolvedColorScheme,
        whitelabelColors,
        forceDynamicBrandRamp,
      }),
      themeOverride,
    ) as MantineTheme;

    // Unjustified type cast. FIXME
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
          const shade = getPrimaryShade(baseTheme, resolvedColorScheme);

          return color in baseTheme.colors
            ? baseTheme.colors[color][shade]
            : // Unjustified type cast. FIXME
              baseTheme.colors[baseTheme.primaryColor as ColorName][shade];
        },
      },
    } as MantineTheme;
  }, [
    themeOverride,
    forceDynamicBrandRamp,
    resolvedColorScheme,
    whitelabelColors,
    onUpdateWhitelabelColors,
    getThemeOverrides,
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
      <DatesProvider>{children}</DatesProvider>
    </MantineProvider>
  );
};
