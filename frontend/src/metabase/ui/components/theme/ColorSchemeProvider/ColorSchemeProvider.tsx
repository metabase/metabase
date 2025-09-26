import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { noop } from "underscore";

import { useSelector } from "metabase/lib/redux/hooks";
import { getIsEmbedding } from "metabase/selectors/embed";

export type ColorScheme = "light" | "dark" | "auto";

interface ColorSchemeContextType {
  colorScheme: ColorScheme;
  resolvedColorScheme: "light" | "dark";
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
}

function getSystemColorScheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveColorScheme(scheme: ColorScheme): "light" | "dark" {
  return scheme === "auto" ? getSystemColorScheme() : scheme;
}

export function ColorSchemeProvider({
  children,
  defaultColorScheme = "light",
}: ColorSchemeProviderProps) {
  const isEmbedding = useSelector(getIsEmbedding);
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

  const [resolvedColorScheme, setResolvedColorScheme] = useState<
    "light" | "dark"
  >(() => resolveColorScheme(colorScheme));

  useEffect(() => {
    // Save to localStorage
    localStorage.setItem("metabase-color-scheme", colorScheme);

    // Update resolved scheme
    setResolvedColorScheme(resolveColorScheme(colorScheme));
  }, [colorScheme]);

  useEffect(() => {
    if (colorScheme === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = (e: MediaQueryListEvent) => {
        setResolvedColorScheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [colorScheme]);

  const value: ColorSchemeContextType = isEmbedding
    ? defaultValue
    : {
        colorScheme,
        resolvedColorScheme,
        setColorScheme,
        toggleColorScheme: () => {
          setColorScheme((current) => {
            switch (current) {
              case "light":
                return "dark";
              case "dark":
                return "auto";
              case "auto":
              default:
                return "light";
            }
          });
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
