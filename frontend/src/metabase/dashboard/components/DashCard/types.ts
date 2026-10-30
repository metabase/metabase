import type { Card, DashboardCard, SeriesCard } from "metabase-types/api";

export type NavigateToNewCardFromDashboardOpts = {
  nextCard: SeriesCard;
  previousCard: Card;
  dashcard: DashboardCard;
  objectId?: number | string;
};

export type DashCardOnChangeCardAndRunHandler = (
  opts: Omit<NavigateToNewCardFromDashboardOpts, "dashcard">,
) => void;

/**
 * Returns the URL for opening `nextCard` from the dashcard's `previousCard`,
 * with the dashboard's filters applied, or `undefined` when it can't be opened.
 */
export type DashCardGetCardHref = (
  opts: Pick<NavigateToNewCardFromDashboardOpts, "nextCard" | "previousCard">,
) => string | undefined;
