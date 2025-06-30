import { createContext } from "react";

interface ThemeContext {
  // Used only in tests to disable the MantineProvider's CSS variables injection because it slows down the tests significantly.
  withCssVariables?: boolean;
}

export const themeProviderContext = createContext<ThemeContext>({});
