import { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { theme } from "metabase/ui";

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => (
  <MantineProvider theme={theme} withNormalizeCSS>
    {children}
  </MantineProvider>
);
