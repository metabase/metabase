import { ReactNode } from "react";
import type { EmotionCache } from "@emotion/cache";
import { withEmotionCache } from "@emotion/react";
import { MantineProvider } from "@mantine/core";
import { theme } from "../../../theme";

interface ThemeProviderProps {
  children?: ReactNode;
}

export const ThemeProvider = withEmotionCache(
  ({ children }: ThemeProviderProps, emotionCache: EmotionCache) => {
    return (
      <MantineProvider theme={theme} emotionCache={emotionCache}>
        {children}
      </MantineProvider>
    );
  },
);
