import type { EmotionCache } from "@emotion/react";
import { withEmotionCache } from "@emotion/react";
import type { MantineThemeOverride } from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import { merge } from "icepick";
import { useMemo, type ReactNode } from "react";

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
}

export const ThemeProvider = withEmotionCache(
  (props: ThemeProviderProps, cache: EmotionCache) => {
    // Merge default theme overrides with user-provided theme overrides
    const theme = useMemo(() => {
      return merge(getThemeOverrides(), props.theme);
    }, [props.theme]);

    return (
      <MantineProvider theme={theme} emotionCache={cache}>
        <DatesProvider>{props.children}</DatesProvider>
      </MantineProvider>
    );
  },
);
