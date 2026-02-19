// eslint-disable-next-line no-restricted-imports
import { ThemeProvider as _CompatibilityEmotionThemeProvider } from "@emotion/react";
import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import { merge } from "icepick";
import {
  type ReactNode,
  useCallback,
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
import { PUT } from "metabase/lib/api";
import { parseHashOptions } from "metabase/lib/browser";
import type {
  ColorScheme,
  ResolvedColorScheme,
} from "metabase/lib/color-scheme";
import {
  getUserColorScheme,
  isValidColorScheme,
  setUserColorSchemeAfterUpdate,
} from "metabase/lib/color-scheme";
import { mutateColors } from "metabase/lib/colors/colors";
import type { ColorName } from "metabase/lib/colors/types";
import MetabaseSettings from "metabase/lib/settings";
import type { DisplayTheme } from "metabase/public/lib/types";

import { getThemeOverrides } from "../../../theme";
import { ColorSchemeProvider, useColorScheme } from "../ColorSchemeProvider";
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

  initialColorScheme?: ColorScheme | undefined;
}

const ThemeProviderInner = (props: ThemeProviderProps) => {
  const { resolvedColorScheme } = useColorScheme();

  // We cannot use `useSetting` here due to circular dependencies,
  // and `useSelector` throws as the redux provider is not always wrapped
  const [whitelabelColors, setWhitelabelColors] = useState(
    MetabaseSettings.applicationColors(),
  );

  // Merge default theme overrides with user-provided theme overrides
  const theme = useMemo(() => {
    const theme = merge(
      getThemeOverrides(resolvedColorScheme, whitelabelColors),
      props.theme,
    ) as MantineTheme;

    return {
      ...theme,
      other: {
        ...theme.other,
        updateColorSettings: (nextWhitelabeledColors) => {
          mutateColors(nextWhitelabeledColors);
          setWhitelabelColors(nextWhitelabeledColors);
        },
      },
      fn: {
        themeColor: (color: ColorName): string => {
          const { primaryShade, primaryColor } = theme;

          return color in theme.colors
            ? theme.colors[color][primaryShade as number]
            : theme.colors[primaryColor as ColorName][primaryShade as number];
        },
      },
    } as MantineTheme;
  }, [props.theme, resolvedColorScheme, whitelabelColors]);

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
    case "light":
    case "transparent":
    case undefined:
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

  const [colorSchemeFromSettings, setColorSchemeFromSettings] =
    useState<ColorScheme>(() => getUserColorScheme() ?? "auto");

  // FIXME: Not only does this use a deprecated API, it also adds a complementary
  // method to the already deprecated method to remove the listener. This is just
  // done provisionally for CI testing purposes.
  useEffect(() => {
    const updateSetting = (value: ColorScheme) => {
      if (value && isValidColorScheme(value)) {
        setColorSchemeFromSettings(value);
      }
    };

    MetabaseSettings.on("color-scheme", updateSetting);

    return () => MetabaseSettings.off("color-scheme", updateSetting);
  }, [setColorSchemeFromSettings]);

  const handleUpdateColorScheme = useCallback(async (value: ColorScheme) => {
    await PUT("/api/setting/:key")({
      key: "color-scheme",
      value: value,
    });

    setUserColorSchemeAfterUpdate(value);
  }, []);

  return (
    <ColorSchemeProvider
      defaultColorScheme={colorSchemeFromSettings ?? getUserColorScheme()}
      forceColorScheme={forceColorScheme}
      onUpdateColorScheme={handleUpdateColorScheme}
    >
      <ThemeProviderInner {...props} />
    </ColorSchemeProvider>
  );
};
