import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { withEmotionCache } from "@emotion/react";
import type { EmotionCache } from "@emotion/react";
import { getThemeOverrides } from "../../../theme";

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = withEmotionCache(
  ({ children }: ThemeProviderProps, cache: EmotionCache) => {
    const theme = getThemeOverrides();

    return (
      <MantineProvider theme={theme} emotionCache={cache}>
        {children}
      </MantineProvider>
    );
  },
);
