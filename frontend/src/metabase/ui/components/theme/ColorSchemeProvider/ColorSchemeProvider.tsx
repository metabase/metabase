import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMedia } from "react-use";
import { noop } from "underscore";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";

export type ResolvedColorScheme = "light" | "dark";

export type ColorScheme = "auto" | ResolvedColorScheme;

interface ColorSchemeContextType {
  colorScheme: ColorScheme;
  resolvedColorScheme: ResolvedColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
}

const defaultValue: ColorSchemeContextType = {
  colorScheme: "light",
  resolvedColorScheme: "light",
  setColorScheme: noop,
  toggleColorScheme: noop,
};

const ColorSchemeContext = createContext<ColorSchemeContextType>(defaultValue);

interface ColorSchemeProviderProps {
  children: ReactNode;
  defaultColorScheme?: ColorScheme;
  forceColorScheme?: ResolvedColorScheme | null;
}

const getNextScheme = (scheme: ResolvedColorScheme) => {
  switch (scheme) {
    case "light":
      return "dark";
    case "dark":
      return "light";
  }
};

export function ColorSchemeProvider({
  children,
  defaultColorScheme = "auto",
  forceColorScheme,
}: ColorSchemeProviderProps) {
  const systemColorScheme = useMedia("(prefers-color-scheme: dark)")
    ? "dark"
    : "light";
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
    // Try to get saved preference from localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("metabase-color-scheme");
      if (saved === "light" || saved === "dark" || saved === "auto") {
        return saved;
      }
    }
    return defaultColorScheme;
  });
  const resolvedColorScheme = useMemo(() => {
    if (forceColorScheme) {
      return forceColorScheme;
    }
    if (getIsEmbeddingIframe()) {
      return "light";
    }
    return colorScheme === "auto" ? systemColorScheme : colorScheme;
  }, [colorScheme, forceColorScheme, systemColorScheme]);

  useEffect(() => {
    localStorage.setItem("metabase-color-scheme", colorScheme);
  }, [colorScheme]);

  const value: ColorSchemeContextType = isEmbeddingSdk()
    ? defaultValue
    : {
        colorScheme,
        resolvedColorScheme,
        setColorScheme,
        toggleColorScheme: () => {
          const nextScheme = getNextScheme(resolvedColorScheme);
          setColorScheme(
            nextScheme === systemColorScheme ? "auto" : nextScheme,
          );
        },
      };

  return (
    <ColorSchemeContext.Provider value={value}>
      {children}
    </ColorSchemeContext.Provider>
  );
}

export function useColorScheme(): ColorSchemeContextType {
  const context = useContext(ColorSchemeContext);
  if (!context) {
    throw new Error("useColorScheme must be used within a ColorSchemeProvider");
  }
  return context;
}
