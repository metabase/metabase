import type { Card, DashboardOrderedCard } from "metabase-types/api";

export type CardSlownessStatus = "usually-fast" | "usually-slow" | boolean;

export type NavigateToNewCardFromDashboardOpts = {
  nextCard: Card;
  previousCard: Card;
  dashcard: DashboardOrderedCard;
  objectId?: unknown;
};

export type DashCardOnChangeCardAndRunHandler = (
  opts: Omit<NavigateToNewCardFromDashboardOpts, "dashcard">,
) => void;
