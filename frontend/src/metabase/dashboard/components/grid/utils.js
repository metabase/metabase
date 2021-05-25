import _ from "underscore";
import { Responsive as ResponsiveGrid } from "react-grid-layout";
import { color } from "metabase/lib/colors";

export function adaptLayoutForBreakpoint({
  layout,
  breakpoints,
  targetBreakpoint,
  closestBreakpoint,
  columns,
  compactType,
}) {
  return ResponsiveGrid.utils.findOrGenerateResponsiveLayout(
    layout,
    breakpoints,
    targetBreakpoint,
    closestBreakpoint,
    columns,
    compactType,
  );
}

export function generateGridBackground({ cellSize, margin, cols, gridWidth }) {
  const XMLNS = "http://www.w3.org/2000/svg";
  const [horizontalMargin, verticalMargin] = margin;
  const rowHeight = cellSize.height + verticalMargin;
  const cellStrokeColor = color("border");

  const y = 0;
  const w = cellSize.width;
  const h = cellSize.height;

  const rectangles = _(cols).times(i => {
    const x = i * (cellSize.width + horizontalMargin);
    return `<rect stroke='${cellStrokeColor}' stroke-width='1' fill='none' x='${x}' y='${y}' width='${w}' height='${h}'/>`;
  });

  const svg = [
    `<svg xmlns='${XMLNS}' width='${gridWidth}' height='${rowHeight}'>`,
    ...rectangles,
    `</svg>`,
  ].join("");

  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
