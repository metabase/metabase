import { t } from "ttag";

import { GRID_WIDTH } from "metabase/lib/dashboard_grid";
import type {
  DashboardCardLayoutAttrs,
  VirtualCard,
  VirtualDashboardCard,
} from "metabase-types/api";

import { createVirtualCard } from "./utils";

type Position = Pick<DashboardCardLayoutAttrs, "col" | "row">;
type Size = Pick<DashboardCardLayoutAttrs, "size_x" | "size_y">;

type SectionDashboardCardAttrs = Partial<VirtualDashboardCard> &
  DashboardCardLayoutAttrs & {
    card: VirtualCard;
    visualization_settings: { virtual_card: VirtualCard };
  };

type LayoutFn = (position: Position) => Array<SectionDashboardCardAttrs>;

// Note: these values are used in analytics and should not be changed
export type SectionId =
  | "kpi_grid"
  | "large_chart_kpi_right"
  | "kpi_chart_below";

export type SectionLayout = {
  id: SectionId;
  label: string;
  getLayout: LayoutFn;
};

const HEADING_HEIGHT = 1;
const SCALAR_CARD_WIDTH = 6;
const SCALAR_CARD_HEIGHT = 3;

function createHeadingDashCard({
  size_x = GRID_WIDTH,
  size_y = HEADING_HEIGHT,
  ...opts
}: Partial<VirtualDashboardCard> &
  DashboardCardLayoutAttrs): SectionDashboardCardAttrs {
  const card = createVirtualCard("heading");
  return {
    ...opts,
    card,
    visualization_settings: {
      "dashcard.background": false,
      virtual_card: card,
    },
    size_x,
    size_y,
  };
}

function createPlaceholderDashCard(
  opts: Partial<VirtualDashboardCard> & DashboardCardLayoutAttrs,
): SectionDashboardCardAttrs {
  const card = createVirtualCard("placeholder");
  return {
    ...opts,
    card,
    visualization_settings: { virtual_card: card },
  };
}

function createScalarDashCardPlaceholder(
  opts: Partial<VirtualDashboardCard> & Position & Partial<Size>,
): SectionDashboardCardAttrs {
  return createPlaceholderDashCard({
    size_x: SCALAR_CARD_WIDTH,
    size_y: SCALAR_CARD_HEIGHT,
    ...opts,
  });
}

const getKpiGridLayout: LayoutFn = position => {
  const heading = createHeadingDashCard({
    ...position,
    size_x: GRID_WIDTH,
    size_y: HEADING_HEIGHT,
  });

  const row = position.row + HEADING_HEIGHT;
  const scalarCardWidth = GRID_WIDTH / 2;
  const scalarCardHeight = 5;

  const row1 = [
    createScalarDashCardPlaceholder({
      col: 0,
      row,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
    createScalarDashCardPlaceholder({
      col: scalarCardWidth,
      row,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
  ];

  const row2 = [
    createScalarDashCardPlaceholder({
      col: 0,
      row: row + scalarCardHeight,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
    createScalarDashCardPlaceholder({
      col: scalarCardWidth,
      row: row + scalarCardHeight,
      size_x: scalarCardWidth,
      size_y: scalarCardHeight,
    }),
  ];

  return [heading, ...row1, ...row2];
};

const getLargeChartKpiColLayout: LayoutFn = position => {
  const heading = createHeadingDashCard({
    ...position,
    size_x: GRID_WIDTH,
    size_y: HEADING_HEIGHT,
  });

  const row = position.row + HEADING_HEIGHT;
  const largeCardWidth = GRID_WIDTH - SCALAR_CARD_WIDTH;

  const scalarCardsColumn = [
    createScalarDashCardPlaceholder({
      col: largeCardWidth,
      row: row,
    }),
    createScalarDashCardPlaceholder({
      col: largeCardWidth,
      row: row + SCALAR_CARD_HEIGHT,
    }),
    createScalarDashCardPlaceholder({
      col: largeCardWidth,
      row: row + SCALAR_CARD_HEIGHT * 2,
    }),
  ];

  const largeCard = createPlaceholderDashCard({
    col: position.col,
    row,
    size_x: largeCardWidth,
    size_y: SCALAR_CARD_HEIGHT * scalarCardsColumn.length,
  });

  return [heading, largeCard, ...scalarCardsColumn];
};

const getKpiLargeChartBelowLayout: LayoutFn = position => {
  const heading = createHeadingDashCard({
    ...position,
    size_x: GRID_WIDTH,
    size_y: HEADING_HEIGHT,
  });

  const row = position.row + HEADING_HEIGHT;

  const largeCardWidth = GRID_WIDTH;
  const largeCardHeight = 9;

  const scalarCardsRow = [
    createScalarDashCardPlaceholder({
      col: 0,
      row: row,
    }),
    createScalarDashCardPlaceholder({
      col: SCALAR_CARD_WIDTH,
      row: row,
    }),
    createScalarDashCardPlaceholder({
      col: SCALAR_CARD_WIDTH * 2,
      row: row,
    }),
    createScalarDashCardPlaceholder({
      col: SCALAR_CARD_WIDTH * 3,
      row: row,
    }),
  ];

  const largeCard = createPlaceholderDashCard({
    col: position.col,
    row: row + SCALAR_CARD_HEIGHT,
    size_x: largeCardWidth,
    size_y: largeCardHeight,
  });

  return [heading, ...scalarCardsRow, largeCard];
};

export const layoutOptions: SectionLayout[] = [
  {
    id: "kpi_grid",
    label: t`KPI grid`,
    getLayout: getKpiGridLayout,
  },
  {
    id: "large_chart_kpi_right",
    label: t`Large chart w/ KPIs to the right`,
    getLayout: getLargeChartKpiColLayout,
  },
  {
    id: "kpi_chart_below",
    label: t`KPIs w/ large chart below`,
    getLayout: getKpiLargeChartBelowLayout,
  },
];
