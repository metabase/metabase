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
