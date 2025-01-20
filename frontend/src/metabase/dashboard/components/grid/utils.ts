import _ from "underscore";

import { getMobileHeight } from "metabase/visualizations/shared/utils/sizes";
import type { BaseDashboardCard } from "metabase-types/api";

function sumVerticalSpace(layout: DashcardLayout[]) {
  return layout.reduce((sum, current) => sum + current.h, 0);
}

type DashcardLayout = {
  dashcard: BaseDashboardCard;
  i: string;
  h: number;
  minH: number;
  minW: number;
  w: number;
  x: number;
  y: number;
};

export function generateMobileLayout(desktopLayout: DashcardLayout[]) {
  const mobile: DashcardLayout[] = [];
  desktopLayout.forEach(item => {
    const card = item.dashcard.card;

    mobile.push({
      ...item,
      x: 0,
      y: sumVerticalSpace(mobile),
      h: getMobileHeight(card.display, item.h),
      w: 1,
    });
  });
  return mobile;
}

type GenerateGridBackgroundOptions = {
  cellSize: { width: number; height: number };
  margin: number[];
  cols: number;
  gridWidth: number;
  cellStrokeColor: string;
};

export function generateGridBackground({
  cellSize,
  margin,
  cols,
  gridWidth,
  cellStrokeColor,
}: GenerateGridBackgroundOptions) {
  const XMLNS = "http://www.w3.org/2000/svg";
  const [horizontalMargin, verticalMargin] = margin;
  const rowHeight = cellSize.height + verticalMargin;

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
