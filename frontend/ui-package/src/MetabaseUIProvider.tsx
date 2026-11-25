import {
  type MantineTheme,
  type MantineThemeComponent,
  type MantineThemeOverride,
  getDefaultZIndex,
  useMantineTheme,
} from "@mantine/core";
import { type ReactNode, useMemo } from "react";
import { createPortal } from "react-dom";

import { deriveFullMetabaseTheme } from "../../src/metabase/ui/colors";
import { OVERLAY_Z_INDEX } from "../../src/metabase/ui/component-theme";
import { drawerOverrides } from "../../src/metabase/ui/components/overlays/Drawer/Drawer.config";
import { PortalContainer } from "../../src/metabase/ui/components/overlays/PortalContainer";
import { tooltipOverrides } from "../../src/metabase/ui/components/overlays/Tooltip/Tooltip.config";
import { OverlayStackProvider } from "../../src/metabase/ui/components/overlays/overlay-stack";
import {
  ColorSchemeContext,
  type ColorSchemeContextType,
} from "../../src/metabase/ui/components/theme/ColorSchemeProvider";
import { ThemeProvider } from "../../src/metabase/ui/components/theme/ThemeProvider";
import { deepMerge } from "../../src/metabase/utils/deep-merge";

const DEFAULT_FONT_FAMILY = '"Lato", Arial, sans-serif';

type ThemeOverride = Omit<
  MantineThemeOverride,
  "fontFamily" | "colors" | "fn" | "other"
> & {
  fontFamily?: never;
  colors?: never;
  fn?: never;
  other?: MantineThemeOverride["other"] & { colorScheme?: never };
};

export interface MetabaseUIProviderProps {
  children: ReactNode;
  colorScheme?: "light" | "dark";
  /** CSS `font-family` value. */
  fontFamily?: string;
  theme?: ThemeOverride;
}

const noop = () => undefined;

// The provider owns these keys; ThemeProvider merges the override last.
const getThemeOverride = (
  theme: MantineThemeOverride | undefined,
): MantineThemeOverride => {
  const {
    fontFamily: _font,
    colors: _colors,
    fn: _fn,
    other,
    ...rest
  } = theme ?? {};
  const { colorScheme: _scheme, ...otherRest } = other ?? {};
  const overlayZIndex = readOverlayZIndex(otherRest.popover);
  const popoverLayer = getDefaultZIndex("popover");
  const components = { ...rest.components };
  if (overlayZIndex !== getDefaultZIndex("modal")) {
    components.Drawer = withOverlayDefaults(components.Drawer, overlayZIndex);
    components.DrawerRoot = withOverlayDefaults(
      components.DrawerRoot,
      overlayZIndex,
      drawerOverrides?.DrawerRoot?.defaultProps,
    );
  }
  const raiseTooltip = overlayZIndex >= popoverLayer + 1;
  if (raiseTooltip || typeof components.Tooltip?.defaultProps === "function") {
    components.Tooltip = withOverlayDefaults(
      components.Tooltip,
      raiseTooltip ? overlayZIndex + 1 : undefined,
      tooltipOverrides?.Tooltip?.defaultProps,
    );
  }
  if (overlayZIndex >= popoverLayer) {
    components.TooltipFloating = withOverlayDefaults(
      components.TooltipFloating,
      overlayZIndex + 1,
    );
  }
  return { ...rest, other: otherRest, components };
};

function withOverlayDefaults(
  component: MantineThemeComponent | undefined,
  zIndex: number | undefined,
  baseDefaults?: unknown,
): MantineThemeComponent {
  const defaults: unknown = component?.defaultProps;
  const withLayer = (props: unknown) => {
    const overrides = readDefaults(props);
    return zIndex !== undefined && overrides.zIndex == null
      ? { ...overrides, zIndex }
      : overrides;
  };
  return {
    ...component,
    defaultProps:
      typeof defaults === "function"
        ? (theme: MantineTheme) =>
            // ThemeProvider merges objects, but a callback replaces the base defaults.
            deepMerge(readDefaults(baseDefaults), withLayer(defaults(theme)))
        : withLayer(defaults),
  };
}

function readDefaults(props: unknown): Record<string, unknown> {
  return props && typeof props === "object" ? { ...props } : {};
}

function readOverlayZIndex(popover: unknown) {
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

export const MetabaseUIProvider = ({
  children,
  colorScheme = "light",
  fontFamily = DEFAULT_FONT_FAMILY,
  theme,
}: MetabaseUIProviderProps) => {
  const themeOverride = useMemo(() => getThemeOverride(theme), [theme]);
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
      <ThemeProvider theme={themeOverride} resolvedColorScheme={colorScheme}>
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
