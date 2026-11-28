import {
  type MantineTheme,
  type MantineThemeComponent,
  type MantineThemeOverride,
  getDefaultZIndex,
} from "@mantine/core";
import { type ReactNode, useMemo } from "react";

import { tooltipOverrides } from "../../src/metabase/ui/components/overlays/Tooltip/Tooltip.config";
import { ThemeProvider } from "../../src/metabase/ui/components/theme/ThemeProvider";
import { deepMerge } from "../../src/metabase/utils/deep-merge";

import {
  StandaloneUIProvider,
  readOverlayZIndex,
} from "./StandaloneUIProvider";

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
  const raiseTooltip = overlayZIndex >= popoverLayer + 1;
  if (raiseTooltip || typeof components.Tooltip?.defaultProps === "function") {
    components.Tooltip = withTooltipDefaults(
      components.Tooltip,
      raiseTooltip ? overlayZIndex + 1 : undefined,
      tooltipOverrides?.Tooltip?.defaultProps,
    );
  }
  if (overlayZIndex >= popoverLayer) {
    components.TooltipFloating = withTooltipDefaults(
      components.TooltipFloating,
      overlayZIndex + 1,
    );
  }
  return { ...rest, other: otherRest, components };
};

function withTooltipDefaults(
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

export const MetabaseUIProvider = ({
  theme,
  ...props
}: MetabaseUIProviderProps) => {
  const themeOverride = useMemo(() => getThemeOverride(theme), [theme]);
  return (
    <StandaloneUIProvider
      {...props}
      theme={themeOverride}
      ThemeProvider={ThemeProvider}
    />
  );
};
