import type { ReactNode } from "react";
import type { MantineThemeOverride } from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import { withEmotionCache } from "@emotion/react";
import type { EmotionCache } from "@emotion/react";
import { merge } from "icepick";
import { getThemeOverrides } from "../../../theme";
import { DatesProvider } from "../DatesProvider";

interface ThemeProviderProps {
  children: ReactNode;
  theme?: MantineThemeOverride;
}

export const ThemeProvider = withEmotionCache(
  ({ children, theme: themeProp }: ThemeProviderProps, cache: EmotionCache) => {
    const theme = merge(getThemeOverrides(), themeProp);

    return (
      <MantineProvider theme={theme} emotionCache={cache}>
        <DatesProvider>{children}</DatesProvider>
      </MantineProvider>
    );
  },
);
