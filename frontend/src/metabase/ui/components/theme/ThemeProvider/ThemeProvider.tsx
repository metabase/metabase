import type { MantineThemeOverride } from "@mantine/core";
import type { ReactNode } from "react";

import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import type { ColorSettings } from "metabase-types/api/color-settings";

import { getThemeOverrides } from "../../../theme";
import "../../overlays/Popover/register-popover-dropdown";
import { ThemeProviderBase } from "./ThemeProviderBase";

export interface ThemeProviderProps {
  children: ReactNode;

  /**
   * Extend Metabase's theme overrides.
   * This is primarily used in the React embedding SDK
   * to allow SDK users to customize the theme.
   */
  theme?: MantineThemeOverride;

  /**
   * Resolved color scheme to use. If not provided, reads from ColorSchemeContext.
   */
  resolvedColorScheme?: ResolvedColorScheme;

  /**
   * Whitelabel color settings. If not provided, defaults to undefined (no whitelabel).
   */
  whitelabelColors?: ColorSettings | null;

  /**
   * Callback invoked when whitelabel colors should be updated.
   */
  onUpdateWhitelabelColors?: (colors: ColorSettings) => void;

  /**
   * CSS selector for Mantine CSS variables injection.
   */
  cssVariablesSelector?: string;

  /**
   * Keeps brand-derived colors as `color-mix()` over `--mb-color-core-brand` instead of
   * replacing them with Ocean stops. Used by SDK.
   */
  forceDynamicBrandRamp?: boolean;
}

export const ThemeProvider = (props: ThemeProviderProps) => (
  <ThemeProviderBase {...props} getThemeOverrides={getThemeOverrides} />
);
