// eslint-disable-next-line no-restricted-imports
import { ThemeProvider as _CompatibilityEmotionThemeProvider } from "@emotion/react";
import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import {
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { parseHashOptions } from "metabase/lib/browser";
import {
  getDarkColorPalette,
  getLightColorPalette,
  mutateColors,
} from "metabase/lib/colors";
import type { MetabaseThemeV2 } from "metabase/lib/colors/types";
import type { DisplayTheme } from "metabase/public/lib/types";

import { ColorSchemeProvider, useColorScheme } from "../ColorSchemeProvider";
import type { ResolvedColorScheme } from "../ColorSchemeProvider/ColorSchemeProvider";
import { DatesProvider } from "../DatesProvider";

import { ThemeProviderContext } from "./context";
import { useDerivedMantineTheme } from "./useDerivedMantineTheme";

interface ThemeProviderProps {
  children: ReactNode;

  /** Theme configuration. If not passed, it uses the default theme based on your color scheme. */
  theme?: MetabaseThemeV2;

  /**
   * Extend Metabase's theme overrides.
   * This is primarily used in legacy theme system
   * for the Embedding SDK.
   */
  themeOverride?: MantineThemeOverride;

  displayTheme?: DisplayTheme | string;
}

const ThemeProviderInner = (props: ThemeProviderProps) => {
  const { resolvedColorScheme } = useColorScheme();
  const [themeCacheBuster, setThemeCacheBuster] = useState(1);

  const sourceTheme: MetabaseThemeV2 = useMemo(() => {
    return props.theme ?? getDefaultMetabaseTheme(resolvedColorScheme);
  }, [props.theme, resolvedColorScheme]);

  const theme = useDerivedMantineTheme({
    resolvedColorScheme,
    theme: sourceTheme,
    themeOverride: props.themeOverride,
  });

  const themeWithColorFn = useMemo(() => {
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
  }, [theme, themeCacheBuster]);

  const { withCssVariables, withGlobalClasses } =
    useContext(ThemeProviderContext);

  return (
    <MantineProvider
      theme={themeWithColorFn}
      forceColorScheme={resolvedColorScheme}
      getStyleNonce={() => window.MetabaseNonce ?? "metabase"}
      classNamesPrefix="mb-mantine"
      cssVariablesSelector={isEmbeddingSdk() ? ".mb-wrapper" : undefined}
      // This slows down unit tests like crazy
      withCssVariables={withCssVariables}
      withGlobalClasses={withGlobalClasses}
    >
      <_CompatibilityEmotionThemeProvider theme={themeWithColorFn}>
        <DatesProvider>{props.children}</DatesProvider>
      </_CompatibilityEmotionThemeProvider>
    </MantineProvider>
  );
};

const getColorSchemeFromDisplayTheme = (
  displayTheme: DisplayTheme | string | boolean | string[] | undefined,
): ResolvedColorScheme | null => {
  switch (displayTheme) {
    case "light":
    case "transparent":
      return "light";
    case "night":
    case "dark":
      return "dark";
  }
  return null;
};

const getColorSchemeOverride = ({ hash }: Location) => {
  return getColorSchemeFromDisplayTheme(parseHashOptions(hash).theme);
};

const useColorSchemeFromHash = ({
  enabled = true,
}: {
  enabled?: boolean;
}): ResolvedColorScheme | null => {
  const [hashScheme, setHashScheme] = useState<ResolvedColorScheme | null>(() =>
    getColorSchemeOverride(location),
  );
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onHashChange = () => setHashScheme(getColorSchemeOverride(location));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [enabled]);
  return enabled ? hashScheme : null;
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

export const getDefaultMetabaseTheme = (scheme: ResolvedColorScheme) => ({
  version: 2 as const,
  colors: scheme === "dark" ? getDarkColorPalette() : getLightColorPalette(),
});
