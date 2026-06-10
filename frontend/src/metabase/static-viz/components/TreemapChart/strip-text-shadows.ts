/**
 * Recursively remove every `textShadow*` style property from an ECharts option.
 *
 * The dynamic treemap gives its tile labels a text shadow for contrast.
 * ECharts' SVG renderer emits that as a `<filter>` with `<feDropShadow>` —
 * an element Batik (the backend's SVG→PNG transcoder, SVG 1.1) cannot create,
 * which fails the whole email render with a `DOMException`. The static option
 * must therefore carry no text shadows anywhere (series label, rich segments,
 * per-node overrides).
 */
export function stripTextShadows<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripTextShadows) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !key.startsWith("textShadow"))
        .map(([key, child]) => [key, stripTextShadows(child)]),
    ) as T;
  }
  return value;
}
