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
  // ChatGPT does not send theming variables, so we have to
  // provide them to match ChatGPT's looks.
  chatgpt: {
    light: {
      "--color-background-primary": "#FFFFFF",
      "--color-background-secondary": "#F9F9F9",
    },
    dark: {
      "--color-background-primary": "#212121",
      "--color-background-secondary": "#181818",
    },
  },

  // Cursor's agents window does not send theming variables,
  // so we can provide a default based on agents window's theme.
  // Agents window only supports 2 themes, no custom theme.
  cursor: {
    light: {
      "--color-background-primary": "#FFFFFF",
      "--color-background-secondary": "#F8F8F8",
    },
    dark: {
      "--color-background-primary": "#181818",
      "--color-background-secondary": "#141414",
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

  // Agent overrides serve as per-key defaults — any value the host actually
  // sends takes precedence.
  const mergedCssVariables = { ...agentOverrides, ...hostCssVariables };

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
