// eslint-disable-next-line no-restricted-imports
import { ThemeProvider as _CompatibilityEmotionThemeProvider } from "@emotion/react";
import type {
  MantineProviderProps,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import { merge } from "icepick";
import { type ReactNode, useMemo } from "react";

import { isEmbeddingSdk } from "metabase/env";

import { getThemeOverrides } from "../../../theme";
import { DatesProvider } from "../DatesProvider";

interface ThemeProviderProps {
  children: ReactNode;

  /**
   * Extend Metabase's theme overrides.
   * This is primarily used in the React embedding SDK
   * to allow SDK users to customize the theme.
   */
  theme?: MantineThemeOverride;
  mantineProviderProps?: MantineProviderProps;
}

export const ThemeProvider = (props: ThemeProviderProps) => {
  // Merge default theme overrides with user-provided theme overrides
  const theme = useMemo(() => {
    const theme = merge(getThemeOverrides(), props.theme) as MantineTheme;

    return {
      ...theme,
      fn: {
        themeColor: (
          color: string,
          shade?: number,
          primaryFallback: boolean = true,
          useSplittedShade: boolean = true,
        ) => {
          if (typeof color === "string" && color.includes(".")) {
            const [splitterColor, _splittedShade] = color.split(".");
            const splittedShade = parseInt(_splittedShade, 10);

            if (
              splitterColor in theme.colors &&
              splittedShade >= 0 &&
              splittedShade < 10
            ) {
              return theme.colors[splitterColor][
                typeof shade === "number" && !useSplittedShade
                  ? shade
                  : splittedShade
              ];
            }
          }

          const _shade =
            typeof shade === "number" ? shade : (theme.primaryShade as number);

          return color in theme.colors
            ? theme.colors[color][_shade]
            : primaryFallback
              ? theme.colors[theme.primaryColor][_shade]
              : color;
        },
      },
    } as MantineTheme;
  }, [props.theme]);

  return (
    <MantineProvider
      theme={theme}
      getStyleNonce={() => window.MetabaseNonce ?? "metabase"}
      classNamesPrefix="mb-mantine"
      cssVariablesSelector={isEmbeddingSdk ? ".mb-wrapper" : undefined}
      {...props.mantineProviderProps}
    >
      <_CompatibilityEmotionThemeProvider theme={theme}>
        <DatesProvider>{props.children}</DatesProvider>
      </_CompatibilityEmotionThemeProvider>
    </MantineProvider>
  );
};
