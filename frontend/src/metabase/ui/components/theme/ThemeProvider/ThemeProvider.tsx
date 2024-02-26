import type { EmotionCache } from "@emotion/react";
import { withEmotionCache } from "@emotion/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

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
