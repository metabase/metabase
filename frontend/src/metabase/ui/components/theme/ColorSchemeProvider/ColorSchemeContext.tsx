import { createContext, useContext } from "react";
import { noop } from "underscore";

import type {
  ColorScheme,
  ResolvedColorScheme,
} from "metabase/utils/color-scheme";

export interface ColorSchemeContextType {
  colorScheme: ColorScheme;
  resolvedColorScheme: ResolvedColorScheme;
  systemColorScheme: ResolvedColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
}

export const colorSchemeContextDefaultValue: ColorSchemeContextType = {
  colorScheme: "light",
  resolvedColorScheme: "light",
  systemColorScheme: "light",
  setColorScheme: noop,
  toggleColorScheme: noop,
};

export const ColorSchemeContext = createContext<ColorSchemeContextType>(
  colorSchemeContextDefaultValue,
);

export function useColorScheme(): ColorSchemeContextType {
  const context = useContext(ColorSchemeContext);
  if (!context) {
    throw new Error("useColorScheme must be used within a ColorSchemeProvider");
  }
  return context;
}
