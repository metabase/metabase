import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { noop } from "underscore";

import { useForceUpdate } from "metabase/common/hooks/use-force-update";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";

type ResolvedColorScheme = "light" | "dark";

export type ColorScheme = "auto" | ResolvedColorScheme;

interface ColorSchemeContextType {
  colorScheme: ColorScheme;
  colorSchemeOverride: null | ColorScheme;
  resolvedColorScheme: ResolvedColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  setColorSchemeOverride: (scheme: null | ResolvedColorScheme) => void;
  toggleColorScheme: () => void;
}

const defaultValue: ColorSchemeContextType = {
  colorScheme: "light",
  colorSchemeOverride: null,
  resolvedColorScheme: "light",
  setColorScheme: noop,
  setColorSchemeOverride: noop,
  toggleColorScheme: noop,
};

const ColorSchemeContext = createContext<ColorSchemeContextType>(defaultValue);

interface ColorSchemeProviderProps {
  children: ReactNode;
  defaultColorScheme?: ColorScheme;
}

function getSystemColorScheme(): ResolvedColorScheme {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveColorScheme(scheme: ColorScheme): ResolvedColorScheme {
  return scheme === "auto" ? getSystemColorScheme() : scheme;
}

export function ColorSchemeProvider({
  children,
  defaultColorScheme = "light",
}: ColorSchemeProviderProps) {
  const [colorSchemeOverride, setColorSchemeOverride] =
    useState<ResolvedColorScheme | null>(null);
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
    if (getIsEmbeddingIframe()) {
      return colorSchemeOverride || "light";
    }
    return resolveColorScheme(colorSchemeOverride || colorScheme);
  }, [colorScheme, colorSchemeOverride]);

  useEffect(() => {
    localStorage.setItem("metabase-color-scheme", colorScheme);
  }, [colorScheme]);

  const forceUpdate = useForceUpdate();
  useEffect(() => {
    if (colorScheme === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = () => forceUpdate();

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [colorScheme, forceUpdate]);

  const value: ColorSchemeContextType = isEmbeddingSdk()
    ? defaultValue
    : {
        colorScheme,
        resolvedColorScheme,
        setColorScheme,
        colorSchemeOverride,
        setColorSchemeOverride,
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
