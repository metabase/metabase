import type { ReactNode } from "react";

import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

import { EmotionCacheProvider } from "./EmotionCacheProvider";
import { ThemeProvider } from "./ThemeProvider";

interface MeasurementProvidersProps {
  children: ReactNode;
}

/**
 * Providers used for detached React roots that only need to measure text/layout
 * (e.g. `useColumnSizing` mounts this into a hidden `<div>` on `document.body`).
 *
 * Because the detached root lives outside the app's `<ColorSchemeProvider>`,
 * `useColorScheme()` here returns its default (`"light"`), so without
 * intervention the nested `<MantineProvider forceColorScheme="light">` would
 * synchronously flip `data-mantine-color-scheme` on `<html>` to `"light"` —
 * making every Mantine scheme-scoped rule (including `--mantine-color-body`)
 * paint the whole app in light mode for one frame (UXW-3733).
 *
 * Read the current scheme off `<html>` (set by the app's main `MantineProvider`)
 * and pass it through so the nested provider writes back the same value and the
 * attribute never changes.
 */
function readCurrentColorScheme(): ResolvedColorScheme {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.getAttribute("data-mantine-color-scheme") ===
    "dark"
    ? "dark"
    : "light";
}

export function MeasurementProviders({ children }: MeasurementProvidersProps) {
  const resolvedColorScheme = readCurrentColorScheme();
  return (
    <EmotionCacheProvider>
      <ThemeProvider resolvedColorScheme={resolvedColorScheme}>
        {children}
      </ThemeProvider>
    </EmotionCacheProvider>
  );
}
