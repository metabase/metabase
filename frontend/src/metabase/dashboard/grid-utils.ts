import _ from "underscore";

import { DEFAULT_CARD_SIZE } from "metabase/lib/dashboard_grid";
import { getVisualizationRaw } from "metabase/visualizations";
import type {
  BaseDashboardCard,
  DashboardTabId,
} from "metabase-types/api/dashboard";

import { generateMobileLayout } from "./components/grid/utils";

export function getLayoutForDashCard(
  dashcard: BaseDashboardCard,
  initialCardSizes: { [key: string]: { w: number; h: number } } | undefined,
) {
  const visualization = getVisualizationRaw([{ card: dashcard.card }]);
  const initialSize = DEFAULT_CARD_SIZE;
  const minSize = visualization?.minSize || DEFAULT_CARD_SIZE;

  let minW, minH;
  if (initialCardSizes) {
    minW = Math.min(initialCardSizes[dashcard.id]?.w, minSize.width);
    minH = Math.min(initialCardSizes[dashcard.id]?.h, minSize.height);
  } else {
    minW = minSize.width;
    minH = minSize.height;
  }

  const w = dashcard.size_x || initialSize.width;
  const h = dashcard.size_y || initialSize.height;

  if (w < minW) {
    minW = w;
  }

  if (h < minH) {
    minH = h;
  }

  return {
    i: String(dashcard.id),
    x: dashcard.col || 0,
    y: dashcard.row || 0,
    w,
    h,
    dashcard: dashcard,
    minW,
    minH,
  };
}

export function getVisibleCards(
  cards: BaseDashboardCard[],
  visibleCardIds: Set<number>,
  isEditing: boolean,
  selectedTabId: DashboardTabId | null,
) {
  const tabCards = cards.filter(
    card =>
      !selectedTabId ||
      card.dashboard_tab_id === selectedTabId ||
      card.dashboard_tab_id === null,
  );

  return isEditing
    ? tabCards
    : tabCards.filter(card => visibleCardIds.has(card.id));
}

export function getInitialCardSizes(
  cards: BaseDashboardCard[],
  initialCardSizes: { [key: string]: { w: number; h: number } } | undefined,
) {
  return cards
    .map(card => getLayoutForDashCard(card, initialCardSizes))
    .reduce((acc, dashcardLayout) => {
      const dashcardId = dashcardLayout.i;
      return {
        ...acc,
        [dashcardId]: _.pick(dashcardLayout, ["w", "h"]),
      };
    }, {});
}

export function getLayouts(
  cards: BaseDashboardCard[],
  initialCardSizes: { [key: string]: { w: number; h: number } } | undefined,
) {
  const desktop = cards.map(card =>
    getLayoutForDashCard(card, initialCardSizes),
  );
  const mobile = generateMobileLayout(desktop);
  return { desktop, mobile };
}
