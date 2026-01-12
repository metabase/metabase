import { createContext } from "react";

interface ThemeContext {
  withCssVariables?: boolean;
  withGlobalClasses?: boolean;
}

export const ThemeProviderContext = createContext<ThemeContext>({});
