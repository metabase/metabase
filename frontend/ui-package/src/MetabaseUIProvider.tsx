import {
  type MantineThemeOverride,
  getDefaultZIndex,
  useMantineTheme,
} from "@mantine/core";
import { type ReactNode, useMemo } from "react";
import { createPortal } from "react-dom";

import { deriveFullMetabaseTheme } from "../../src/metabase/ui/colors";
import { OVERLAY_Z_INDEX } from "../../src/metabase/ui/component-theme";
import { PortalContainer } from "../../src/metabase/ui/components/overlays/PortalContainer";
import { OverlayStackProvider } from "../../src/metabase/ui/components/overlays/overlay-stack";
import {
  ColorSchemeContext,
  type ColorSchemeContextType,
} from "../../src/metabase/ui/components/theme/ColorSchemeProvider";
import { ThemeProvider } from "../../src/metabase/ui/components/theme/ThemeProvider";

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
  const defaultTooltipZIndex = getDefaultZIndex("popover") + 1;
  const tooltip = rest.components?.Tooltip;
  const defaultProps: unknown = tooltip?.defaultProps;
  if (
    overlayZIndex < defaultTooltipZIndex ||
    (defaultProps &&
      typeof defaultProps === "object" &&
      "zIndex" in defaultProps &&
      defaultProps.zIndex != null)
  ) {
    return { ...rest, other: otherRest };
  }

  return {
    ...rest,
    other: otherRest,
    components: {
      ...rest.components,
      Tooltip: {
        ...tooltip,
        defaultProps: {
          ...(defaultProps && typeof defaultProps === "object"
            ? defaultProps
            : {}),
          zIndex: overlayZIndex + 1,
        },
      },
    },
  };
};

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
