import { GRID_WIDTH } from "metabase/lib/dashboard_grid";
import {
  createHeadingDashcard,
  createPlaceholderDashCard,
} from "./dashcard-utils";

type LayoutOpts = {
  col: number;
  row: number;
};

const HEADING_HEIGHT = 1;

export function layout1({ col, row }: LayoutOpts) {
  const heading = createHeadingDashcard({ col, row, sizeY: HEADING_HEIGHT });

  const nextRow = row + HEADING_HEIGHT;
  const scalarCardWidth = 7;
  const scalarCardHeight = 3;
  const largeCardWidth = GRID_WIDTH - scalarCardWidth;

  const scalarCards = [
    createPlaceholderDashCard({
      col: largeCardWidth,
      row: nextRow,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
    createPlaceholderDashCard({
      col: largeCardWidth,
      row: nextRow + scalarCardHeight,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
    createPlaceholderDashCard({
      col: largeCardWidth,
      row: nextRow + scalarCardHeight * 2,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
  ];

  const largeCard = createPlaceholderDashCard({
    col,
    row: nextRow,
    size_x: largeCardWidth,
    size_y: scalarCardHeight * scalarCards.length,
  });

  return [heading, largeCard, ...scalarCards];
}

export function layout2({ col, row }: LayoutOpts) {
  const heading = createHeadingDashcard({ col, row, sizeY: HEADING_HEIGHT });

  const nextRow = row + HEADING_HEIGHT;
  const scalarCardWidth = GRID_WIDTH / 3;
  const scalarCardHeight = 3;

  const largeCardWidth = GRID_WIDTH;
  const largeCardHeight = 9;

  const scalarCards = [
    createPlaceholderDashCard({
      col: 0,
      row: nextRow,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
    createPlaceholderDashCard({
      col: scalarCardWidth,
      row: nextRow,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
    createPlaceholderDashCard({
      col: scalarCardWidth * 2,
      row: nextRow,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
  ];

  const largeCard = createPlaceholderDashCard({
    col,
    row: nextRow + scalarCardHeight,
    size_x: largeCardWidth,
    size_y: largeCardHeight,
  });

  return [heading, ...scalarCards, largeCard];
}

export const layoutOptions = [
  {
    id: 1,
    label: "Layout 1",
    getLayout: layout1,
  },
  {
    id: 2,
    label: "Layout 2",
    getLayout: layout2,
  },
];
