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
 * Returns the URL a dashcard navigates to: the dashcard's own question when
 * called without arguments, otherwise `nextCard` reached from `previousCard`.
 */
export type DashCardGetHref = (
  opts?: Pick<NavigateToNewCardFromDashboardOpts, "nextCard" | "previousCard">,
) => string | undefined;
