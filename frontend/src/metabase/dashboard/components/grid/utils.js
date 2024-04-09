import _ from "underscore";

import { color } from "metabase/lib/colors";

function sumVerticalSpace(layout) {
  return layout.reduce((sum, current) => sum + current.h, 0);
}

export function generateMobileLayout({
  desktopLayout,
  defaultCardHeight,
  heightByDisplayType = {},
}) {
  const mobile = [];
  desktopLayout.forEach(item => {
    const card = item.dashcard.card;
    const height = heightByDisplayType[card.display] || defaultCardHeight;
    mobile.push({
      ...item,
      x: 0,
      y: sumVerticalSpace(mobile),
      h: height,
      w: 1,
    });
  });
  return mobile;
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
