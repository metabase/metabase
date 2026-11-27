import { type MantineThemeOverride, useMantineTheme } from "@mantine/core";
import { type ComponentType, useMemo } from "react";
import { createPortal } from "react-dom";

import { deriveFullMetabaseTheme } from "../../src/metabase/ui/colors";
import { OVERLAY_Z_INDEX } from "../../src/metabase/ui/component-theme";
import { PortalContainer } from "../../src/metabase/ui/components/overlays/PortalContainer";
import { OverlayStackProvider } from "../../src/metabase/ui/components/overlays/overlay-stack";
import {
  ColorSchemeContext,
  type ColorSchemeContextType,
} from "../../src/metabase/ui/components/theme/ColorSchemeProvider";
import type { ThemeProviderProps } from "../../src/metabase/ui/components/theme/ThemeProvider";

import type { MetabaseUIProviderProps } from "./MetabaseUIProvider";

const DEFAULT_FONT_FAMILY = '"Lato", Arial, sans-serif';
const noop = () => undefined;

export function readOverlayZIndex(popover: unknown) {
  return popover &&
    typeof popover === "object" &&
    "zIndex" in popover &&
    typeof popover.zIndex === "number" &&
    Number.isInteger(popover.zIndex)
    ? popover.zIndex
    : OVERLAY_Z_INDEX;
}

const CssVariables = ({
  colorScheme,
  fontFamily,
}: Required<Pick<MetabaseUIProviderProps, "colorScheme" | "fontFamily">>) => {
  const theme = useMantineTheme();
  const zIndex = readOverlayZIndex(theme.other.popover);

  const css = useMemo(() => {
    const { colors } = deriveFullMetabaseTheme({ colorScheme });
    const declarations = [
      ...Object.entries(colors).map(
        ([name, value]) => `--mb-color-${name}: ${value};`,
      ),
      `--mb-default-font-family: ${fontFamily};`,
      `--mb-overlay-z-index: ${zIndex};`,
    ];
    return `:root { ${declarations.join(" ")} }`;
  }, [colorScheme, fontFamily, zIndex]);

  return <style>{css}</style>;
};

export const StandaloneUIProvider = ({
  children,
  colorScheme = "light",
  fontFamily = DEFAULT_FONT_FAMILY,
  theme,
  ThemeProvider,
}: Omit<MetabaseUIProviderProps, "theme"> & {
  theme?: MantineThemeOverride;
  ThemeProvider: ComponentType<ThemeProviderProps>;
}) => {
  const colorSchemeContext = useMemo<ColorSchemeContextType>(
    () => ({
      colorScheme,
      resolvedColorScheme: colorScheme,
      systemColorScheme: colorScheme,
      setColorScheme: noop,
      toggleColorScheme: noop,
    }),
    [colorScheme],
  );

  return (
    <ColorSchemeContext.Provider value={colorSchemeContext}>
      <ThemeProvider theme={theme} resolvedColorScheme={colorScheme}>
        <CssVariables colorScheme={colorScheme} fontFamily={fontFamily} />
        <OverlayStackProvider>
          {children}
          {/* Tooltips portal into this container. */}
          {createPortal(<PortalContainer />, document.body)}
        </OverlayStackProvider>
      </ThemeProvider>
    </ColorSchemeContext.Provider>
  );
};
