import type {
  ActionDashboardCard,
  Card,
  DashboardCard,
  VirtualDashboardCard,
} from "metabase-types/api";

export type CardSlownessStatus = "usually-fast" | "usually-slow" | boolean;

export type NavigateToNewCardFromDashboardOpts = {
  nextCard: Card;
  previousCard: Card;
  dashcard: ActionDashboardCard | DashboardCard | VirtualDashboardCard;
  objectId?: unknown;
};

export type DashCardOnChangeCardAndRunHandler = (
  opts: Omit<NavigateToNewCardFromDashboardOpts, "dashcard">,
) => void;
