import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MantineColorScheme } from "@mantine/core";

export type ColorScheme = "light" | "dark" | "auto";

interface ColorSchemeContextType {
  colorScheme: ColorScheme;
  resolvedColorScheme: MantineColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
}

const ColorSchemeContext = createContext<ColorSchemeContextType | null>(null);

interface ColorSchemeProviderProps {
  children: ReactNode;
  defaultColorScheme?: ColorScheme;
}

function getSystemColorScheme(): MantineColorScheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveColorScheme(scheme: ColorScheme): MantineColorScheme {
  return scheme === "auto" ? getSystemColorScheme() : scheme;
}

export function ColorSchemeProvider({
  children,
  defaultColorScheme = "light"
}: ColorSchemeProviderProps) {
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

  const [resolvedColorScheme, setResolvedColorScheme] = useState<MantineColorScheme>(() =>
    resolveColorScheme(colorScheme)
  );

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

  const toggleColorScheme = () => {
    setColorScheme(current => {
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
  };

  const value: ColorSchemeContextType = {
    colorScheme,
    resolvedColorScheme,
    setColorScheme,
    toggleColorScheme,
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