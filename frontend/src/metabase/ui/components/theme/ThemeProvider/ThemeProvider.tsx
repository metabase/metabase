// eslint-disable-next-line no-restricted-imports
import { ThemeProvider as _CompatibilityEmotionThemeProvider } from "@emotion/react";
import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import { merge } from "icepick";
import { type ReactNode, useContext, useMemo, useState } from "react";

import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { mutateColors } from "metabase/lib/colors/colors";
import { useEmbedFrameOptions } from "metabase/public/hooks";
import type { DisplayTheme } from "metabase/public/lib/types";

import { getThemeOverrides } from "../../../theme";
import { ColorSchemeProvider, useColorScheme } from "../ColorSchemeProvider";
import type { ResolvedColorScheme } from "../ColorSchemeProvider/ColorSchemeProvider";
import { DatesProvider } from "../DatesProvider";

import { ThemeProviderContext } from "./context";

interface ThemeProviderProps {
  children: ReactNode;

  /**
   * Extend Metabase's theme overrides.
   * This is primarily used in the React embedding SDK
   * to allow SDK users to customize the theme.
   */
  theme?: MantineThemeOverride;

  displayTheme?: DisplayTheme | string;
}

const ThemeProviderInner = (props: ThemeProviderProps) => {
  const { resolvedColorScheme } = useColorScheme();
  const [themeCacheBuster, setThemeCacheBuster] = useState(1);

  // Merge default theme overrides with user-provided theme overrides
  const theme = useMemo(() => {
    const theme = merge(
      getThemeOverrides(resolvedColorScheme),
      props.theme,
    ) as MantineTheme;

    return {
      ...theme,
      other: {
        ...theme.other,
        updateColorSettings: (newValue) => {
          mutateColors(newValue);
          setThemeCacheBuster(themeCacheBuster + 1);
        },
      },
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
  }, [props.theme, resolvedColorScheme, themeCacheBuster]);

  const { withCssVariables, withGlobalClasses } =
    useContext(ThemeProviderContext);

  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={resolvedColorScheme}
      getStyleNonce={() => window.MetabaseNonce ?? "metabase"}
      classNamesPrefix="mb-mantine"
      cssVariablesSelector={isEmbeddingSdk() ? ".mb-wrapper" : undefined}
      // This slows down unit tests like crazy
      withCssVariables={withCssVariables}
      withGlobalClasses={withGlobalClasses}
    >
      <_CompatibilityEmotionThemeProvider theme={theme}>
        <DatesProvider>{props.children}</DatesProvider>
      </_CompatibilityEmotionThemeProvider>
    </MantineProvider>
  );
};

const getColorSchemeFromDisplayTheme = (
  displayTheme: DisplayTheme | string | boolean | string[] | undefined,
): ResolvedColorScheme | null => {
  switch (displayTheme) {
    case undefined:
    case "light":
    case "transparent":
      return "light";
    case "night":
    case "dark":
      return "dark";
  }
  return null;
};

const useColorSchemeFromHash = ({
  enabled = true,
}: {
  enabled?: boolean;
}): ResolvedColorScheme | null => {
  const { theme } = useEmbedFrameOptions({
    location,
    listenToHashChangeEvents: true,
  });

  return enabled ? getColorSchemeFromDisplayTheme(theme) : null;
};

export const ThemeProvider = (props: ThemeProviderProps) => {
  const schemeFromHash = useColorSchemeFromHash({
    enabled: isStaticEmbedding() || isPublicEmbedding(),
  });
  const forceColorScheme = props.displayTheme
    ? getColorSchemeFromDisplayTheme(props.displayTheme)
    : schemeFromHash;

  return (
    <ColorSchemeProvider forceColorScheme={forceColorScheme}>
      <ThemeProviderInner {...props} />
    </ColorSchemeProvider>
  );
};
