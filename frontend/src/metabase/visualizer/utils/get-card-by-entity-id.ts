import type { Card, DashboardCard } from "metabase-types/api";
import { isSavedCard } from "metabase-types/guards";

export const getCardByEntityId = (dashcard?: DashboardCard) => {
  const cardByEntityId: Record<string, Card> = {};

  if (!dashcard) {
    return cardByEntityId;
  }

  const mainCard = dashcard.card;
  if (isSavedCard(mainCard)) {
    cardByEntityId[mainCard.entity_id] = mainCard;
  }

  if ("series" in dashcard && dashcard.series != null) {
    dashcard.series.forEach((card) => {
      cardByEntityId[card.entity_id] = card;
    });
  }

  return cardByEntityId;
};
