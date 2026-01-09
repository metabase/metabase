import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMedia } from "react-use";
import { noop } from "underscore";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type {
  ColorScheme,
  ResolvedColorScheme,
} from "metabase/lib/color-scheme";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";

interface ColorSchemeContextType {
  colorScheme: ColorScheme;
  resolvedColorScheme: ResolvedColorScheme;
  systemColorScheme: ResolvedColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
}

const defaultValue: ColorSchemeContextType = {
  colorScheme: "light",
  resolvedColorScheme: "light",
  systemColorScheme: "light",
  setColorScheme: noop,
  toggleColorScheme: noop,
};

const ColorSchemeContext = createContext<ColorSchemeContextType>(defaultValue);

interface ColorSchemeProviderProps {
  children: ReactNode;
  defaultColorScheme?: ColorScheme;
  forceColorScheme?: ResolvedColorScheme | null;
  onUpdateColorScheme?: (scheme: ColorScheme) => void;
}

const getNextScheme = (scheme: ResolvedColorScheme) =>
  scheme === "dark" ? "light" : "dark";

export function ColorSchemeProvider({
  children,
  defaultColorScheme = "auto",
  forceColorScheme,
  onUpdateColorScheme,
}: ColorSchemeProviderProps) {
  const systemColorScheme = useMedia("(prefers-color-scheme: dark)")
    ? "dark"
    : "light";

  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    defaultColorScheme || "auto",
  );

  useEffect(() => {
    // NOTE: The `defaultColorScheme` prop may change in cases where the
    // page hasn't reloaded (therefore embedded user preferences haven't
    // changed) but a new set of preferences arrives from events, such as
    // session changes after login/logout.
    //
    // If such new preferences specify a different color scheme, we then
    // react to those changes.
    //
    // See: `ThemeProvider.tsx:181`
    setColorScheme(defaultColorScheme);
  }, [defaultColorScheme]);

  const resolvedColorScheme = useMemo(() => {
    if (forceColorScheme) {
      return forceColorScheme;
    }
    if (getIsEmbeddingIframe()) {
      return "light";
    }
    return colorScheme === "auto" ? systemColorScheme : colorScheme;
  }, [colorScheme, forceColorScheme, systemColorScheme]);

  const handleColorSchemeUpdate = useCallback(
    (value: ColorScheme) => {
      setColorScheme(value);
      onUpdateColorScheme?.(value);
    },
    [onUpdateColorScheme],
  );

  const value: ColorSchemeContextType = isEmbeddingSdk()
    ? defaultValue
    : {
        colorScheme,
        resolvedColorScheme,
        setColorScheme: handleColorSchemeUpdate,
        systemColorScheme,
        toggleColorScheme: () => {
          const nextScheme = getNextScheme(resolvedColorScheme);
          handleColorSchemeUpdate(
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
