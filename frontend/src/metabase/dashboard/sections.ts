import { GRID_WIDTH } from "metabase/lib/dashboard_grid";
import type { BaseDashboardCard } from "metabase-types/api";
import {
  createHeadingDashcard,
  createPlaceholderDashCard,
} from "./dashcard-utils";

type LayoutOpts = {
  col: number;
  row: number;
};

type LayoutFn = (opts: LayoutOpts) => BaseDashboardCard[];

export type LayoutOption = {
  id: number;
  label: string;
  getLayout: LayoutFn;
};

const HEADING_HEIGHT = 1;

export function layout1({ col, row }: LayoutOpts) {
  const heading = createHeadingDashcard({
    col,
    row,
    size_x: GRID_WIDTH,
    size_y: HEADING_HEIGHT,
  });

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
  const heading = createHeadingDashcard({
    col,
    row,
    size_x: GRID_WIDTH,
    size_y: HEADING_HEIGHT,
  });

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

export const layoutOptions: LayoutOption[] = [
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
