import { useEffect } from "react";

import type { MetabaseTheme } from "embedding-sdk-package";
import type { MetabaseColor } from "metabase/embedding-sdk/theme";
import type { ResolvedColorScheme } from "metabase/lib/color-scheme";

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
 * Pick the light or dark arm from a CSS `light-dark(<light>, <dark>)` value.
 *
 * Commas inside color functions like rgba() are always followed by digits/spaces,
 * so splitting on a comma followed by a letter or # reliably finds the separator.
 */
function resolveLightDark(value: string, scheme: ResolvedColorScheme): string {
  const inner = value.slice("light-dark(".length, -1);
  const separator = inner.search(/,\s*(?=[a-zA-Z#])/);

  if (separator === -1) {
    return value;
  }

  const light = inner.slice(0, separator).trim();
  const dark = inner.slice(separator + 1).trim();

  return scheme === "dark" ? dark : light;
}

/**
 * Resolve a CSS value that may contain var() references into a concrete color.
 *
 * MCP hosts like Visual Studio Code sends CSS variable references
 * e.g. `var(--vscode-editor-background)` as theming values.
 *
 * The SDK requires concrete color values, so we resolve them
 * via the browser's computed style cascade.
 */
function resolveConcreteColor(
  valueOrCssVariable: string,
  scheme: ResolvedColorScheme,
): string {
  if (!valueOrCssVariable) {
    return valueOrCssVariable;
  }

  if (valueOrCssVariable.startsWith("light-dark(")) {
    return resolveLightDark(valueOrCssVariable, scheme);
  }

  if (!valueOrCssVariable.startsWith("var(")) {
    return valueOrCssVariable;
  }

  const container = document.createElement("div");

  // Set color-scheme so the browser resolves light-dark() correctly.
  container.style.colorScheme = scheme;
  container.style.color = valueOrCssVariable;
  document.body.appendChild(container);

  const resolved = getComputedStyle(container).color;
  document.body.removeChild(container);

  const value = resolved || valueOrCssVariable;

  // Fallback: if the browser returned light-dark() unresolved, parse it manually.
  if (value.startsWith("light-dark(")) {
    return resolveLightDark(value, scheme);
  }

  return value;
}

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

export function useInjectMcpAppsStyling(
  hostCssVariables: Record<string, string>,
  hostStyles: { css?: { fonts?: string } } | undefined,
) {
  // Apply the host's CSS variables to the document root so we can
  useEffect(() => {
    Object.entries(hostCssVariables).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }, [hostCssVariables]);

  // Inject any host-provided font-face declarations.
  useEffect(() => {
    const style = document.createElement("style");
    const { fonts } = hostStyles?.css ?? {};

    if (fonts) {
      style.textContent = fonts;
      document.head.appendChild(style);
    }

    return () => {
      if (fonts) {
        document.head.removeChild(style);
      }
    };
  }, [hostStyles]);
}
