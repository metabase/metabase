import type {
  MetabaseColor,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

import { resolveConcreteColor } from "../utils/resolveConcreteColor";

/**
 * Map the MCP Apps' host-provided CSS variables to SDK color keys.
 * This differs by MCP hosts e.g. Claude Desktop, Visual Studio Code.
 */
const MCP_HOST_VAR_TO_SDK_COLOR: Record<
  string,
  Exclude<MetabaseColor, "charts">
> = {
  "--color-background-primary": "background",
  "--color-background-secondary": "background-secondary",
  "--color-background-disabled": "background-disabled",
  "--color-text-primary": "text-primary",
  "--color-text-secondary": "text-secondary",
  "--color-text-tertiary": "text-tertiary",
  "--color-border-secondary": "border",
};

/**
 * Per-agent CSS variable overrides, applied on top of what the host sends.
 * Keyed by `hostContext.userAgent`. Each agent may define `light` and/or `dark`
 * overrides; both are optional.
 */
const AGENT_CSS_VARIABLE_OVERRIDES: Record<
  string,
  Partial<Record<ResolvedColorScheme, Record<string, string>>>
> = {
  chatgpt: {
    dark: {
      "--color-background-primary": "#212121",
    },
  },
};

interface BuildMcpAppsThemeOptions {
  hostCssVariables: Record<string, string>;
  preset: ResolvedColorScheme;
  agentName?: string;
}

export function buildMcpAppsTheme({
  hostCssVariables,
  preset,
  agentName,
}: BuildMcpAppsThemeOptions): MetabaseTheme {
  const agentOverrides =
    (agentName && AGENT_CSS_VARIABLE_OVERRIDES[agentName]?.[preset]) || {};

  const mergedCssVariables = { ...hostCssVariables, ...agentOverrides };

  const colors: MetabaseTheme["colors"] = {};

  for (const [cssVarKey, sdkKey] of Object.entries(MCP_HOST_VAR_TO_SDK_COLOR)) {
    if (mergedCssVariables[cssVarKey]) {
      colors[sdkKey] = resolveConcreteColor(
        mergedCssVariables[cssVarKey],
        preset,
      );
    }
  }

  return { preset, colors };
}
