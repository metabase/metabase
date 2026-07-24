import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";
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
  const [isPrinting, setIsPrinting] = useState(false);

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

  useEffect(() => {
    // Flip to light synchronously so the print snapshot is readable;
    // browsers strip dark backgrounds via `print-color-adjust: economy`.
    const onBeforePrint = () => {
      flushSync(() => setIsPrinting(true));
    };
    const onAfterPrint = () => {
      setIsPrinting(false);
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, []);

  const resolvedColorScheme = useMemo(() => {
    // Print wins over every other preference — paper is light.
    if (isPrinting) {
      return "light";
    }
    if (forceColorScheme) {
      return forceColorScheme;
    }
    if (getIsEmbeddingIframe()) {
      return "light";
    }
    return colorScheme === "auto" ? systemColorScheme : colorScheme;
  }, [colorScheme, forceColorScheme, isPrinting, systemColorScheme]);

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
