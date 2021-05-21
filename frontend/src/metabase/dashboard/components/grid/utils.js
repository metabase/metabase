import _ from "underscore";
import { color } from "metabase/lib/colors";

export function generateGridBackground({ cellSize, margin, cols, gridWidth }) {
  const XMLNS = "http://www.w3.org/2000/svg";
  const rowHeight = cellSize.height + margin;
  const cellStrokeColor = color("border");

  const y = 0;
  const w = cellSize.width;
  const h = cellSize.height;

  const rectangles = _(cols).times(i => {
    const x = i * (cellSize.width + margin);
    return `<rect stroke='${cellStrokeColor}' stroke-width='1' fill='none' x='${x}' y='${y}' width='${w}' height='${h}'/>`;
  });

  const svg = [
    `<svg xmlns='${XMLNS}' width='${gridWidth}' height='${rowHeight}'>`,
    ...rectangles,
    `</svg>`,
  ].join("");

  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
