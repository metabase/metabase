import type { ResolvedColorScheme } from "metabase/lib/color-scheme";

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
export function resolveConcreteColor(
  valueOrCssVariable: string,
  scheme: ResolvedColorScheme,
): string {
  if (!valueOrCssVariable) {
    return valueOrCssVariable;
  }

  // Transform light-dark(...) values to concrete colors
  // before sending them to the SDK.
  if (valueOrCssVariable.startsWith("light-dark(")) {
    return resolveLightDark(valueOrCssVariable, scheme);
  }

  // Transform var(...) values to concrete colors
  // before sending them to the SDK.
  if (valueOrCssVariable.startsWith("var(")) {
    const container = document.createElement("div");
    container.style.color = valueOrCssVariable;
    document.body.appendChild(container);

    const resolved = getComputedStyle(container).color;
    document.body.removeChild(container);

    return resolved || valueOrCssVariable;
  }

  // Plain color value, return as-is.
  return valueOrCssVariable;
}
