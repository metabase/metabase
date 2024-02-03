import type {
  ActionDashboardCard,
  Card,
  QuestionDashboardCard,
  VirtualDashboardCard,
} from "metabase-types/api";

export type CardSlownessStatus = "usually-fast" | "usually-slow" | boolean;

export type NavigateToNewCardFromDashboardOpts = {
  nextCard: Card;
  previousCard: Card;
  dashcard: ActionDashboardCard | QuestionDashboardCard | VirtualDashboardCard;
  objectId?: unknown;
};

export type DashCardOnChangeCardAndRunHandler = (
  opts: Omit<NavigateToNewCardFromDashboardOpts, "dashcard">,
) => void;
