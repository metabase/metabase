import type { ResolvedColorScheme } from "metabase/lib/color-scheme";

/**
 * Resolve a CSS value that may contain var() or light-dark() into a concrete color.
 *
 * MCP hosts like Visual Studio Code send CSS variable references
 * e.g. `light-dark(white, black)` as theming values.
 *
 * The SDK requires concrete color values, so we resolve them via the browser's
 * computed style cascade. Setting `color-scheme` on the container ensures
 * light-dark() resolves to the correct arm for the host's theme.
 */
export function resolveConcreteColor(
  valueOrCssVariable: string,
  scheme: ResolvedColorScheme,
): string {
  if (!valueOrCssVariable) {
    return valueOrCssVariable;
  }

  if (
    !valueOrCssVariable.startsWith("var(") &&
    !valueOrCssVariable.startsWith("light-dark(")
  ) {
    return valueOrCssVariable;
  }

  const container = document.createElement("div");
  container.style.colorScheme = scheme;
  container.style.color = valueOrCssVariable;
  document.body.appendChild(container);

  const resolved = getComputedStyle(container).color;
  document.body.removeChild(container);

  return resolved || valueOrCssVariable;
}
