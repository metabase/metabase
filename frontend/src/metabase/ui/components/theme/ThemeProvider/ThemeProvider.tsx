import type { ReactNode } from "react";
import { createTheme, MantineProvider } from "@mantine/core";
import { ClassNames } from "@emotion/react";
import { getThemeOverrides } from "../../../theme";

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  return (
    <ClassNames>
      {styles => (
        <MantineProvider theme={createTheme(getThemeOverrides(styles))}>
          {children}
        </MantineProvider>
      )}
    </ClassNames>
  );
};
