import { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { getThemeOverrides } from "../../../theme";

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const theme = getThemeOverrides();
  return <MantineProvider theme={theme}>{children}</MantineProvider>;
};
