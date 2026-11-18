import type { CSSVariablesResolver, MantineThemeOverride } from "@mantine/core";
import { type ReactNode, useCallback } from "react";

import { deriveFullMetabaseTheme } from "metabase/ui/colors";
import type { ColorSettings } from "metabase/ui/colors/types/color-settings";
import { OVERLAY_Z_INDEX } from "metabase/ui/component-theme";
import { PortalContainer } from "metabase/ui/components/overlays/PortalContainer";
import { OverlayStackProvider } from "metabase/ui/components/overlays/overlay-stack";
import { ThemeProvider } from "metabase/ui/components/theme/ThemeProvider";

import {
  COLOR_CSS_VARIABLE_PREFIX,
  PROVIDER_CSS_VARIABLES,
} from "./css-variable-names";

const DEFAULT_FONT_FAMILY = '"Lato", Arial, sans-serif';

export interface MetabaseUIProviderProps {
  children: ReactNode;
  colorScheme?: "light" | "dark";
  /** CSS `font-family` value, e.g. `"Lato", Arial, sans-serif`. */
  fontFamily?: string;
  theme?: MantineThemeOverride;
  /** Element that receives the CSS variables. */
  cssVariablesSelector?: string;
  nonce?: string;
  whitelabelColors?: ColorSettings | null;
  onUpdateWhitelabelColors?: (colors: ColorSettings) => void;
}

export const MetabaseUIProvider = ({
  children,
  colorScheme = "light",
  fontFamily = DEFAULT_FONT_FAMILY,
  theme,
  cssVariablesSelector = ":root",
  nonce,
  whitelabelColors,
  onUpdateWhitelabelColors,
}: MetabaseUIProviderProps) => {
  const cssVariablesResolver = useCallback<CSSVariablesResolver>(
    (mantineTheme) => {
      const { colors } = deriveFullMetabaseTheme({
        colorScheme,
        whitelabelColors,
      });
      const colorVariables = Object.fromEntries(
        Object.entries(colors).map(([name, value]) => [
          `${COLOR_CSS_VARIABLE_PREFIX}${name}`,
          String(value),
        ]),
      );

      // Written to `variables` (both schemes) since ThemeProvider forces the scheme.
      return {
        variables: {
          ...colorVariables,
          [PROVIDER_CSS_VARIABLES.defaultFontFamily]: fontFamily,
          [PROVIDER_CSS_VARIABLES.defaultMonospaceFontFamily]:
            mantineTheme.fontFamilyMonospace,
          // Same source as the app's `popover.zIndex` mapping in getThemeSpecificCssVariables.
          [PROVIDER_CSS_VARIABLES.overlayZIndex]: String(
            mantineTheme.other?.popover?.zIndex ?? OVERLAY_Z_INDEX,
          ),
        },
        light: {},
        dark: {},
      };
    },
    [colorScheme, fontFamily, whitelabelColors],
  );

  return (
    <ThemeProvider
      theme={theme}
      resolvedColorScheme={colorScheme}
      whitelabelColors={whitelabelColors}
      onUpdateWhitelabelColors={onUpdateWhitelabelColors}
      cssVariablesSelector={cssVariablesSelector}
      cssVariablesResolver={cssVariablesResolver}
      nonce={nonce}
    >
      {/* Overlays throw without a stack, and tooltips portal into this container. */}
      <OverlayStackProvider>
        {children}
        <PortalContainer />
      </OverlayStackProvider>
    </ThemeProvider>
  );
};
