import { type ReactNode, useCallback, useEffect, useState } from "react";

import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import type { DisplayTheme } from "metabase/embedding/types";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { MantineThemeOverride } from "metabase/ui";
import { mutateColors } from "metabase/ui/colors/colors";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";
import { PUT } from "metabase/utils/api";
import { parseHashOptions } from "metabase/utils/browser";
import type {
  ColorScheme,
  ResolvedColorScheme,
} from "metabase/utils/color-scheme";
import {
  getUserColorScheme,
  isValidColorScheme,
  setUserColorSchemeAfterUpdate,
} from "metabase/utils/color-scheme";
import MetabaseSettings from "metabase/utils/settings";
import type { ColorSettings } from "metabase-types/api";

import { AppColorSchemeProvider } from "./AppColorSchemeProvider";

interface AppThemeProviderProps {
  children: ReactNode;

  /**
   * Extend Metabase's theme overrides.
   */
  theme?: MantineThemeOverride;

  displayTheme?: DisplayTheme | string;

  initialColorScheme?: ColorScheme | undefined;
}

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

export const AppThemeProvider = (props: AppThemeProviderProps) => {
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

  // Whitelabel colors management
  const [whitelabelColors, setWhitelabelColors] = useState<
    ColorSettings | undefined
  >(() => MetabaseSettings.applicationColors());

  const handleUpdateWhitelabelColors = useCallback(
    (nextColors: ColorSettings) => {
      mutateColors(nextColors);
      setWhitelabelColors(nextColors);
    },
    [],
  );

  return (
    <AppColorSchemeProvider
      defaultColorScheme={colorSchemeFromSettings ?? getUserColorScheme()}
      forceColorScheme={forceColorScheme}
      onUpdateColorScheme={handleUpdateColorScheme}
    >
      <ThemeProvider
        theme={props.theme}
        whitelabelColors={whitelabelColors}
        onUpdateWhitelabelColors={handleUpdateWhitelabelColors}
        cssVariablesSelector={isEmbeddingSdk() ? ".mb-wrapper" : undefined}
      >
        {props.children}
      </ThemeProvider>
    </AppColorSchemeProvider>
  );
};
