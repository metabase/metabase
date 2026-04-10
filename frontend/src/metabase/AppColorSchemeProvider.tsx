import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMedia } from "react-use";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import {
  ColorSchemeContext,
  type ColorSchemeContextType,
  colorSchemeContextDefaultValue,
} from "metabase/ui/components/theme/ColorSchemeProvider";

import type { ColorScheme } from "./utils/color-scheme";

interface AppColorSchemeProviderProps {
  children: ReactNode;
  defaultColorScheme?: ColorScheme;
  forceColorScheme?: "light" | "dark" | null;
  onUpdateColorScheme?: (scheme: ColorScheme) => void;
}

const getNextScheme = (scheme: "light" | "dark") =>
  scheme === "dark" ? "light" : "dark";

export function AppColorSchemeProvider({
  children,
  defaultColorScheme = "auto",
  forceColorScheme,
  onUpdateColorScheme,
}: AppColorSchemeProviderProps) {
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
    ? colorSchemeContextDefaultValue
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
