import { ReactNode } from "react";
import type { EmotionCache } from "@emotion/cache";
import { MantineProvider } from "@mantine/core";
import { theme } from "../../../theme";

interface ThemeProviderProps {
  emotionCache?: EmotionCache;
  children: ReactNode;
}

export const ThemeProvider = ({
  emotionCache,
  children,
}: ThemeProviderProps) => (
  <MantineProvider theme={theme} emotionCache={emotionCache}>
    {children}
  </MantineProvider>
);
