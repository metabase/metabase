import type { Card, DashboardCard } from "metabase-types/api";

export type CardSlownessStatus = "usually-fast" | "usually-slow" | boolean;

export type NavigateToNewCardFromDashboardOpts = {
  nextCard: Card;
  previousCard: Card;
  dashcard: DashboardCard;
  objectId?: number | string;
};

export type DashCardOnChangeCardAndRunHandler = (
  opts: Omit<NavigateToNewCardFromDashboardOpts, "dashcard">,
) => void;
