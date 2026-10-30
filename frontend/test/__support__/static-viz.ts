import { measureTextWidth } from "metabase/static-viz/lib/text";

const LEGEND_MARKER_SELECTOR = "rect[rx]";
const TRANSLATE_PATTERN = /translate\((?<x>[-\d.]+),\s*(?<y>[-\d.]+)\)/;

interface Span {
  left: number;
  right: number;
}

export interface StaticLegendGeometry {
  /** The height of the whole image, chart and legend. */
  svgHeight: number;
  /** The height of the chart's own SVG, which the legend sits below. */
  chartHeight: number;
  /** The y offset the legend block is placed at. */
  legendTop: number;
  /** The plot between the axes, read from the chart's widest horizontal line. */
  plot: Span;
  /** The rendered rows of legend items, top to bottom. */
  rows: Span[];
  itemNames: string[];
}

const parseTranslate = (element: Element | null) => {
  const groups = element
    ?.getAttribute("transform")
    ?.match(TRANSLATE_PATTERN)?.groups;
  return groups ? { x: Number(groups.x), y: Number(groups.y) } : null;
};

// `M x1 y L x2 y`: a straight horizontal segment such as an axis or grid line
const HORIZONTAL_LINE_PATTERN =
  /^M\s*(?<x1>[-\d.]+)[\s,]+(?<y1>[-\d.]+)\s*L\s*(?<x2>[-\d.]+)[\s,]+(?<y2>[-\d.]+)\s*$/;

// The x-axis and grid lines span the plot, and the Batik sanitizer strips the
// clip rects that would otherwise give its bounds.
const getPlot = (chartSvg: SVGSVGElement): Span => {
  const spans = Array.from(chartSvg.querySelectorAll("path"))
    .map(
      (path) => path.getAttribute("d")?.match(HORIZONTAL_LINE_PATTERN)?.groups,
    )
    .filter((groups) => groups != null && groups.y1 === groups.y2)
    .map((groups) => ({
      left: Math.min(Number(groups?.x1), Number(groups?.x2)),
      right: Math.max(Number(groups?.x1), Number(groups?.x2)),
    }));
  const plot = spans.sort((a, b) => b.right - b.left - (a.right - a.left))[0];
  if (!plot) {
    throw new Error(
      "The chart SVG has no horizontal axis line to read the plot from",
    );
  }
  return plot;
};

/**
 * Reads where a static chart put its legend relative to its plot. The legend
 * items are the groups holding a rounded marker rect; their text widths come
 * from the same measurer the layout used.
 */
export function getStaticLegendGeometry(
  container: HTMLElement,
): StaticLegendGeometry {
  const chartSvg = container.querySelector<SVGSVGElement>("svg svg");
  if (!chartSvg) {
    throw new Error("No chart SVG rendered");
  }
  const markers = Array.from(
    container.querySelectorAll<SVGRectElement>(LEGEND_MARKER_SELECTOR),
  );
  const itemGroups = markers.map((marker) => {
    const group = marker.parentElement;
    if (!group) {
      throw new Error("Legend marker has no group");
    }
    return group;
  });
  const legendRoot = itemGroups[0]?.parentElement ?? null;
  const legendOffset = parseTranslate(legendRoot);
  if (!legendOffset) {
    throw new Error("No legend rendered");
  }

  const rowsByTop = new Map<number, Span>();
  const itemNames: string[] = [];
  for (const group of itemGroups) {
    const offset = parseTranslate(group);
    const text = group.querySelector("text");
    if (!offset || !text) {
      throw new Error("Legend item is missing its position or label");
    }
    const name = text.textContent ?? "";
    itemNames.push(name);
    const fontSize = Number(text.getAttribute("font-size"));
    const fontWeight = Number(text.getAttribute("font-weight"));
    const markerWidth = Number(text.getAttribute("x"));
    const right =
      offset.x + markerWidth + measureTextWidth(name, fontSize, fontWeight);
    const row = rowsByTop.get(offset.y);
    rowsByTop.set(offset.y, {
      left: Math.min(row?.left ?? offset.x, offset.x),
      right: Math.max(row?.right ?? right, right),
    });
  }

  return {
    svgHeight: Number(container.querySelector("svg")?.getAttribute("height")),
    chartHeight: Number(chartSvg.getAttribute("height")),
    legendTop: legendOffset.y,
    plot: getPlot(chartSvg),
    rows: Array.from(rowsByTop.entries())
      .sort(([topA], [topB]) => topA - topB)
      .map(([, span]) => span),
    itemNames,
  };
}

export const getSpanCenter = ({ left, right }: Span) => (left + right) / 2;
