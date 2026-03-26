import type {
  MetabaseColor,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import type { ResolvedColorScheme } from "metabase/lib/color-scheme";

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

export function buildMcpAppsTheme(
  hostCssVariables: Record<string, string>,
  preset: ResolvedColorScheme,
): MetabaseTheme {
  const colors: MetabaseTheme["colors"] = {};

  for (const [cssVarKey, sdkKey] of Object.entries(MCP_HOST_VAR_TO_SDK_COLOR)) {
    if (hostCssVariables[cssVarKey]) {
      colors[sdkKey] = resolveConcreteColor(
        hostCssVariables[cssVarKey],
        preset,
      );
    }
  }

  return { preset, colors };
}
